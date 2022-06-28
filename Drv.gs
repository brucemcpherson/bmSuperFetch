/**
 * @typedef DrvApiOptions
 * @property {_SuperFetch} superFetch a superfetch instance
 * @property {boolean} noCache whether to cache
 * @property {boolean} includeItemsFromAllDrives or just those owned by me
 * @property {string} base the base path on the bucket (all paths will be relative to this)
 * @property {string} orderBy default order of list results
 * @property {boolean} showUrl whether to showUrls when fetching
 * @property {object[]} extraParams always add these params
 */
class _DrvApi {
  /**
   * @param {DrvApiOptions} params
   * @return {_DrvApi}
   */
  constructor({
    superFetch,
    noCache = false,
    base = '',
    includeItemsFromAllDrives = false,
    orderBy = "folder,name,modifiedTime desc",
    showUrl = false,
    extraParams = []
  } = {}) {

    // max fetch payload size is 50mb must be multiple of 256k
    this.maxPost = 1024 * 256
    if (this.maxPost % (256 * 1024)) {
      throw new Error('Max post must be multiple of 256k')
    }
    this.superFetch = superFetch
    this.extraParams = Utils.arrify(extraParams)
    this.base = base
    this.noCache = noCache
    this.orderBy = orderBy
    this.includeItemsFromAllDrives = includeItemsFromAllDrives
    this.showUrl = showUrl
    // normal api endpoint
    this.proxy = superFetch.proxy({
      endPoint: `https://www.googleapis.com/drive/v3`,
      noCache,
      showUrl
    })
    // special uploading endpoint
    this.uploadProxy = superFetch.proxy({
      endPoint: `https://www.googleapis.com/upload/drive/v3/files`,
      noCache,
      showUrl
    })
    // for when we have a complete url with no endpoint required
    this.vanillaProxy = superFetch.proxy({
      endPoint: ``,
      noCache,
      showUrl
    })
  }
  /**
   * create a new ref - which is just another instance of the class with a different base
   * @param {string} base a new base 
   * @param {DrvApiOptions}
   * @return {_DrvApi}
   */
  ref(base = '', {
    superFetch = this.superFetch,
    noCache = this.noCache,
    includeItemsFromAllDrives = this.includeItemsFromAllDrives,
    orderBy = this.orderBy,
    showUrl = this.showUrl,
    extraParams = this.extraParams
  } = {}) {
    return new _DrvApi({
      superFetch,
      includeItemsFromAllDrives,
      orderBy,
      noCache,
      showUrl,
      extraParams,
      base: Utils.singleSlash(this.base + (base ? '/' + base : ''))
    })
  }

  /**
   * folders domain
   * @return {object} containing the functions available in the folders
   */
  get folders() {
    const self = this
    return {
      /**
       * folders.path domain
       * @param {object} params
       * @param {string} params.path the folder path
       * @return {object} containing the functions available in the folders.path
       */
      path: ({ path = '' } = {}) => {
        return {
          /** 
          * get folders  from a path
          * @param {object} params
          * @params {boolean} params.createIfMissing  folders if it doesn exist
          * @return {PackResponse} the folders metadata 
          */
          get: ({ createIfMissing } = {}) => self.getFolders({ path, createIfMissing })
        }
      }
    }
  }

  /**
   * files domain
   * @return {object} containing the functions available in the files
   */
  get files() {
    const self = this
    return {
      /**
       * files.path domain
       * @param {object} params
       * @param {string} params.path the folder/file path
       * @return {object} containing the functions available in the folders.path
      */
      path: ({ path = '' } = {}) => {
        return {

          /**
           * get a file metadata
           * @param {...*} params any additional api params
           * @return {PackResponse} the file metadata
          */
          get: (...params) => self.get({ path }, ...params),

          /**
           * list files in a given path
           * @param {object} p
           * @param {string} [p.query] any additional quiery filter
           * @param {...*} [params] any additional url params
           * @return {PackResponse} the list of matching items
           */
          list: ({ query } = {}, ...params) => self.list({ path, query }, ...params),

          /**
           * download a file content from its path
           * @param {object} p
           * @param {string} [p.contentType] override the content type specified in the files metadata if required
           * @param {...*} [params] any additional url params
           * @return {PackResponse} the file metadata
           */
          download: ({ contentType } = {}, ...params) => {
            const result = self.get({ path }, ...params)
            if (result.error) return result
            return this.getContentById({ id: result.data.id, contentType })
          },

          /**
           * upload a file to a path
           * @param {object} params
           * @param {string} params.path the target path
           * @param {object} [params.metadata] file metadata if required
           * @param {boolean} [createIfMissing=true] create any missing folders in the given path
           * @param {Blob} params.blob the blob to upload (contains the metadata and the contentType as well as the bytes)
           * @param {...*} params.params any additional url params
           * @return {PackResponse} the file metadata
           */
          upload: ({ metadata, blob, createIfMissing = true }, ...params) =>
            self.upload({ path, metadata, blob, createIfMissing }, ...params),

        }
      },

      id: ({ id = '' } = {}) => {
        return {
          /**
           * get a files metadata from its id
           * @param {...*} params any additional url params
           * @return {PackResponse} the file metadata
          */
          get: (...params) => self.getById({ id }, ...params),
          /**
           * download a file content from its path
           * @param {object} params
           * @param {string} [params.contentType] override the content type specified in the files metadata if required
           * @return {PackResponse} the file metadata
           */
          download: ({ contentType } = {}, ...params) => {
            return this.getContentById({ id, contentType })
          }
        }
      }
    }
  }


  /**
   * @return {string} not found message
   */
  get nf() {
    return 'not found:'
  }

  /**
   * check if its a not found error
   * @param {string} error an error message
   * @return {boolean} its a not found message
   */
  isNotFound(error) {
    return error && error.length >= this.nf.length ? error.slice(0, this.nf.length) === this.nf : false
  }

  /**
   * make a folder query
   * @param {object} params
   * @param {string} params.folderId the parent folderId
   * @param {string} params.title the name of the folder
   * @param {string} params.query any additional query filters
   * @return {object} the query
   */
  makeFolderQuery({ folderId, title, query }) {
    query = [
      `mimeType = '${this.folderMimeType}'`,
      query
    ].filter(f => f).join(" and ")
    return this.makeParentQuery({ folderId, title, query })
  }

  /**
   * make a folder query involving a parent
   * @param {object} params
   * @param {string} params.folderId the parent folderId
   * @param {string} params.title the name of the folder
   * @param {string} params.query any additional query filters
   * @return {object} the query
   */
  makeParentQuery({ folderId, title, query }) {
    const q = [
      folderId ? `'${folderId}' in parents` : '',
      title ? `name = '${title}'` : '',
      'trashed = false',
      query
    ].filter(f => f).join(" and ")
    return {
      q
    }
  }

  /**
   * get a file metadata
   * @param {object} params
   * @param {string} params.folderId the parent folderId
   * @param {string} params.title the name of the file
   * @param {string} params.query any additional query filters
   * @return {PackResponse} the file metadata
   */
  getFile({ folderId, title, query }) {
    return this.proxy(this.filesPath + Utils.addParams([
      this.makeParentQuery({ folderId, title, query })
    ].concat(this.extraParams)))
  }

  /** 
   * get a folder metadata
   * @param {object} params
   * @param {string} params.folderId the parent folderId
   * @param {string} params.title the name of the folder
   * @params {boolean} params.createIfMissing create a folder if it doesn exist
   * @param {string} params.query any additional query filters
   * @return {PackResponse} the folder metadata
   */
  _getFolder({ parentId, title, createIfMissing, path }) {

    // if we're potentially writing, we want to make sure there's no caching to confuse things
    const proxy = createIfMissing ? this.ref('', { noCache: true }).proxy : this.proxy

    // get the folder whose parentId matches
    let result = proxy(this.filesPath + Utils.addParams([
      this.makeFolderQuery({ folderId: parentId, title })
    ].concat(this.extraParams)))

    if (result.error) return result
    let { files } = result.data

    // if we're creating missing folders, then do that here
    if (!files.length && createIfMissing) {
      result = this.setFile(this.makeMetadata({ parentId, title, mimeType: this.folderMimeType }))
      if (result.error) return result
      files = result.data.files
    }

    // if we've created a folder in the meantime it's definition will be in files
    // and the result will be the result of setting the new folder
    if (!files || !files.length) {
      result.error = this.nf + ' - ' + path
    }
    return result
  }

  /** 
   * get a all the folders in a deconstructed path
   * @param {object} params
   * @param {string[]} params.titles the folder names deconstructed from a path
   * @params {boolean} params.createIfMissing create a folder if it doesn exist
   * @return {object} the folder metadata along the way
   */
  _getFolders({ titles, createIfMissing }) {
    // the titles should be an array of each path element
    return titles.reduce((p, title, i) => {

      // reconstruct the path so far as text
      const path = titles.slice(0, i + 1).join("/")

      // template for a folder
      let f = {
        title,
        path,
        id: null,
        parentId: p.parentId,
        matches: 0
      }
      // if thre's no error yet then we can continue
      if (!p.error) {
        // gets the next folder in line
        const r = this._getFolder({ parentId: f.parentId, title, createIfMissing, path })

        // need to stop
        if (r.error) {
          p.error = r.error
        } else {
          // this is the id of the found folder
          const { files } = r.data
          const [file] = files
          f = {
            ...f,
            ...file,
            matches: files.length
          }
          p.parentId = f.id
        }
      }

      // all folder results are stored
      p.folders.push(f)

      // this is the current id
      p.id = f.id

      // the path so far
      p.path = f.path

      // this is the next parent
      p.id = f.id
      return p
    }, {
      folders: [],
      error: null,
      parentId: 'root',
      id: null,
      path: ''
    })
  }


  /** 
   * get folders  from a path
   * @param {object} params
   * @param {string} params.path the folder path
   * @params {boolean} params.createIfMissing  folders if it doesn exist
   * @return {PackResponse} the folders metadata 
   */
  getFolders({ path, createIfMissing = false }) {
    // split the path into its components
    const titles = path.replace(/^\//, '').split("/")
    const res = this._getFolders({ titles, createIfMissing })
    return Utils.makeThrow({
      error: res.error,
      data: {
        id: res.id,
        path: res.path,
        parentId: res.parentId,
        folders: res.folders
      }
    })

  }
  /**
   * @return {object[]} the standard params for all list queries
   */
  get standardParams() {
    return [{ includeItemsFromAllDrives: this.includeItemsFromAllDrives, orderBy: this.orderBy }]
  }

  /**
   * relative path for the files api
   * @return {string}
   */
  get filesPath() {
    return '/files'
  }

  /**
   * @param {object} file metadata
   * @return {boolean} whether a file is a file (not a folder)
   */
  isFolder(file) {
    return file.mimeType === this.folderMimeType
  }

  /**
   * mimetype of a folder
   * @return {string}
   */
  get folderMimeType() {
    return KnownContentTypes.domains.getDetail('google', 'folder').mimeType
  }

  /** 
   * make a path with an id
   * @param {object} params
   * @param {string} params.id the file id
   * @return {string} the file path
   */
  makeFilePath({ id }) {
    return this.filesPath + '/' + id
  }

  /** 
   * get a files metadata from its id
   * @param {object} params
   * @param {string} params.id the file id
   * @param {...*} params.params any additional url params
   * @return {PackResponse} the file
   */
  getById({ id }, ...params) {
    return this.proxy(`${this.makeFilePath({ id })}${Utils.addParams(params.concat(this.extraParams))}`)
  }

  /**
   * get a file part from a full path
   * @param {object} params
   * @param {string} params.path the file path
   * @return {string} the file name
   */
  getFilePath({ path }) {
    return `${this.base}/${path}`.split("/").slice(-1).join("")
  }

  /**
   * get a folder part from a full path
   * @param {object} params
   * @param {string} params.path the file path
   * @return {string} the file name
   */
  getFolderPath({ path }) {
    return `${this.base}/${path}`.split("/").slice(0, -1).join("/")
  }


  /**
   * create a metadata object
   * @param {object} params
   * @param {string} params.parentId the parent folderid
   * @param {string} params.mimeType file mimeType
   * @param {string} params.title file name
   * @return {object} metadata object
   */
  makeMetadata({ parentId, mimeType, title }) {
    return {
      name: title,
      parents: [parentId],
      mimeType
    }
  }

  /**
   * create a file with just metadata and JSON type
   * @param {object} meta
   * @return {PackResponse} 
   */
  setFile(meta) {
    return this.proxy(this.filesPath, {
      payload: JSON.stringify(meta),
      contentType: 'application/json',
      method: "POST"
    })
  }

  /**
   * get a file metadata
   * @param {object} params
   * @param {string} params.path the complete file path
   * @param {string} params.params any additional api params
   * @return {PackResponse} the file metadata
   */
  // get an item
  get({ path = '' } = {}, ...params) {
    // first find the folder
    const folderPath = this.getFolderPath({ path })
    const pack = this.getFolders({ path: folderPath })
    if (pack.error) return pack
    // now get the list of matching files
    // note - will only return the first (most recenty modified) - there may be more than 1 and will be ignored
    const title = this.getFilePath({ path })
    const file = this.getFile({ folderId: pack.data.id, title })
    if (file.error) return file
    if (!file.data.files.length) {
      file.error = `file not found - ${folderPath}/${title}`
      return Utils.makeThrow(file)
    } else {
      return this.getById({ id: file.data.files[0].id })
    }
  }

  /**
   * get a file content by its id
   * @param {object} params
   * @param {string} params.id the file id
   * @param {string} [params.contentType] override the content type specified in the files metadata if required
   * @return {PackResponse} the file metadata
   */
  getContentById({ id, contentType = null }) {

    // first get the file metadata
    const metaResult = this.getById({ id })
    if (metaResult.error) return metaResult

    // now get the content
    const result =
      this.proxy(`${this.makeFilePath({ id })}${Utils.addParams([{ alt: 'media' }].concat(this.extraParams))}`)
    if (result.error) return result

    // because the blob typically doesn't have a contenttype, we can force it
    result.blob.setContentType(contentType || metaResult.data.mimeType)
    result.blob.setName(metaResult.data.name)

    // return the content
    return result
  }

  /**
   * get a file content from its path
   * @param {object} params
   * @param {string} params.path the file path
   * @param {string} [params.contentType] override the content type specified in the files metadata if required
   * @return {PackResponse} the file metadata
   */
  getContent({ path = '', contentType } = {}, ...params) {
    const result = this.get({ path }, ...params)
    if (result.error) return result
    return this.getContentById({ id: result.data.id, contentType })
  }

  /**
   * patch an a item by path
   * @param {object} params
   * @param {string} params.path the file path
   * @param {string} params.data complete file metadata
   * @return {PackResponse} the file metadata
   */
  patch({ path, data } = {}, ...params) {
    return this.set({
      path,
      data,
      method: "PATCH"
    })
  }

  /**
   * initialize a resumable/chunked upload
   * @param {object} params
   * @param {object[]} params.params any extra api params
   * @param {object} [params.metadata] file metadata if required
   * @param {Blob} params.blob the blob to upload (should contain the metadata and the contentType as well as the bytes)
   * @return {PackResponse} the file metadata
   */
  // this initializes a resumable upload and gets a url to use to complete it
  _initResumableUpload({ params, metadata, blob }) {
    const path = Utils.addParams([{ uploadType: 'resumable' }].concat(params))

    // if there's any upload metadata
    const payload = metadata ? JSON.stringify(metadata) : ''

    // special headers
    const xContentType = blob.getContentType()
    const bytes = blob.getBytes()
    const headers = {
      "X-Upload-Content-Length": bytes.length
    }
    // this refers to the file metadata
    if (payload) {
      headers["Content-Type"] = "application/json; charset=UTF-8"
    }
    // this is the content type of the data we'll be loading later
    if (xContentType) {
      headers["X-Upload-Content-Type"] = xContentType
    }
    // make the post to initialize the upload
    const r1 = this.uploadProxy(path, {
      method: "POST",
      payload,
      headers
    })
    if (r1.error) return r1

    // get the headers - we'll need  a location endpoint
    const location = r1.response.getHeaders().Location
    if (!location) {
      r1.error = 'Missing location header'
      return Utils.makeThrow(r1)
    }
    r1.location = location
    return r1
  }

  /**
   * continue a resumable/chunked upload after initialization
   * @param {object} params
   * @param {string} params.location the uri returned by upload intialization
   * @param {Blob} params.blob the blob to upload
   * @return {PackResponse} the file metadata
   */
  _hitResumableUpload({ location, blob }) {
    const bytes = blob.getBytes()

    // limit chunks to size handled by fetch
    const ci = Utils.makeChunkIterator({ arr: blob.getBytes(), size: this.maxPost })

    // kick off iterator
    let result = {}
    let next = ci.next()

    // do each chunk
    while (!next.done && !result.error) {
      const header = {
        "Content-Length": next.chunk.length,
        "Content-Range": `${next.start}-${next.start + next.chunk.length - 1}/${bytes.length}`
      }
      result = this.vanillaProxy(location, {
        method: "PUT",
        payload: next.chunk,
        header
      })

      next = ci.next()
    }
    // final result will be the last chunk write
    return result || Utils.makeThrow({
      error: 'no data in blob'
    })
  }

  /**
   * upload a file to a path
   * @param {object} params
   * @param {string} params.path the target path
   * @param {object} [params.metadata] file metadata if required
   * @param {boolean} [createIfMissing=true] create any missing folders in the given path
   * @param {Blob} params.blob the blob to upload (should contain the metadata and the contentType as well as the bytes)
   * @param {...*} params.params any additional url params
   * @return {PackResponse} the file metadata
   */
  upload({ path = '', metadata, blob, createIfMissing = true }, ...params) {

    // the parent folder
    const folderPath = this.getFolderPath({ path })

    // the filename
    const title = this.getFilePath({ path })

    // get the id of the folderpath parent
    const folder = this.getFolders({ path: folderPath, createIfMissing })
    if (folder.error) return folder

    // the file metadata
    const meta = this.makeMetadata({ parentId: folder.data.id, mimeType: blob.getContentType(), title })
    // initialize the upload
    const init = this._initResumableUpload({
      params,
      metadata: {
        ...meta,
        ...(metadata || {})
      },
      blob
    })
    if (init.error) return init

    // now we should have an endpoint to hit with the data
    return this._hitResumableUpload({ location: init.location, blob })

  }

  /**
   * list files in a given folder
   * @param {object} params
   * @param {string} params.folderId the target folder id
   * @param {string} [params.query] any additional quiery filter
   * @param {object[]} params.params any additional url params
   * @return {PackResponse} the list of matching items
   */
  _list({ folderId, query, params }) {
    // now apply the query

    return Utils.pager((pageToken) =>
      this.proxy(
        this.filesPath + Utils.addParams(
          [this.makeParentQuery({ folderId, query })]
            .concat(this.extraParams)
            .concat(params)
            .concat(pageToken ? [{ pageToken }] : [])
        )
      )
    )
  }

  /**
   * list files in a given path
   * @param {object} params
   * @param {string} params.path the target folder path
   * @param {string} [params.query] any additional quiery filter
   * @param {object[]} params.params any additional url params
   * @return {PackResponse} the list of matching items
   */
  list({ path = '', query = '' } = {}, ...params) {
    // first find the parent folder

    const folders = this.getFolders({ path })
    if (folders.error) return folders
    const { data: folder } = folders
    return this._list({ folderId: folder.id, query, params })
  }

}



