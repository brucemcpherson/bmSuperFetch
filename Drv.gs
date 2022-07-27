/**
 * @typedef DrvApiOptions
 * @property {_SuperFetch} superFetch a superfetch instance
 * @property {boolean} noCache whether to cache
 * @property {boolean} includeItemsFromAllDrives or just those owned by me
 * @property {string} base the base path on the bucket (all paths will be relative to this)
 * @property {string} orderBy default order of list results
 * @property {boolean} showUrl whether to showUrls when fetching
 * @property {object[]} extraParams always add these params
 * @property {number} maxWait how long to wait max for rate limit probs
 * @property {number} max max number to return
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
    extraParams = [],
    max = Infinity,
    //  6 minutes
    maxWait = 60 * 6 * 1000
  } = {}) {
    this.minChunk = 1
    this.maxChunk = 1000
    this.maxWait = maxWait
    this.max = max
    // max fetch payload size is 50mb must be multiple of 256k
    // set this as near to 50mb as poss (or whatever the urlfetch quota is nowadays, but as multiple of 256k)
    this.maxPost = 256 * 1024 * 4 * 50
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
    this.endPoint = `https://www.googleapis.com/drive/v3`
    // normal api endpoint
    this.proxy = superFetch.proxy({
      endPoint: this.endPoint,
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
      noCache: true,
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
    extraParams = this.extraParams,
    max = this.max,
    maxWait = this.maxWait
  } = {}) {
    return new _DrvApi({
      superFetch,
      includeItemsFromAllDrives,
      orderBy,
      noCache,
      showUrl,
      extraParams,
      base: Utils.combinePath(this.base, base),
      max,
      maxWait
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
      path: ({ path } = {}) => {
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

  _fileClosure({ id: pid, path: ppath, name: pname } = {}) {
    const self = this
    return {

      /**
       * get a file metadata
       * @param {object} p
       * @param {string} [p.path] the folder/file path
       * @param {string} [p.name] the target file name
       * @param {string} [p.id] the target file id
       * @param {...*} params any additional api params
       * @return {PackResponse} the file metadata
      */
      get: ({ id, path, name } = {}, ...params) =>
        self.get({ id: id || pid, path: Utils.combinePath(ppath, path), name: pname || name }, ...params),

      page: (page) => {
        return {
          list: ({ query, path, name } = {}, ...params) =>
            self.list({ page, query, path: Utils.combinePath(ppath, path), name: pname || name }, ...params),
        }
      },

      /**
       * list files in a given path
       * @param {object} p
       * @param {string} [p.path] the folder/file path
       * @param {string} [p.name] the target file name
       * @param {string} [p.query] any additional quiery filter
       * @param {...*} [params] any additional url params
       * @return {PackResponse} the list of matching items
       */
      list: ({ query, path, name } = {}, ...params) =>
        self.list({ query, path: Utils.combinePath(ppath, path), name: pname || name }, ...params),

      /**
       * download a file content from its path
       * @param {object} p
       * @param {string} [p.path] the folder/file path
       * @param {string} [p.name] the target file name
       * @param {string} [p.id] the target file id
       * @param {string} [p.contentType] override the content type specified in the files metadata if required
       * @param {...*} [params] any additional url params
       * @return {PackResponse} the file content
       */
      download: ({ contentType, id, path, name } = {}, ...params) => {
        const result = self.get({ id: id || pid, path: Utils.combinePath(ppath, path), name: pname || name }, ...params)
        if (result.error) return result
        return this._getContentById({ id: result.data.id, contentType })
      },

      /**
       * export a workspace file
       * @param {object} p
       * @param {string} [p.path] the folder/file path
       * @param {string} [p.name] the target file name
       * @param {string} [p.id] the target file id
       * @param {string} p.contentType the content type to export as
       * @param {...*} [params] any additional url params
       * @return {PackResponse} the file content
       */
      export: ({ contentType, id, path, name } = {}, ...params) => {
        const result = self.get({ id: id || pid, path: Utils.combinePath(ppath, path), name: pname || name }, ...params)
        if (result.error) return result
        return this._exportById({ id: result.data.id, contentType })
      },

      /**
       * convert a workspace file
       * @param {object} p
       * @param {string} [p.path] the folder/file path
       * @param {string} [p.name] the target file name
       * @param {string} [p.id] the target file id           
       * @param {string} p.contentType the content type to export as
       * @param {string} p.toPath the output path
       * @param {string} p.toName the output name
       * @param {boolean} [p.createIfMissing=true] create any missing folders in the given path
       * @param {...*} [params] any additional url params
       * @return {PackResponse} the file content
       */
      convert: ({ id, path, name, contentType, toPath, toName, createIfMissing = true } = {}, ...params) => {
        const result = self.get({ id: id || pid, path: Utils.combinePath(ppath, path), name: pname || name }, ...params)
        if (result.error) return result
        return this._convertById({ id: result.data.id, contentType, toPath, toName, createIfMissing })
      },
      /**
       * upload a file to a path
       * @param {object} p
       * @param {string} [p.path] the folder/file path
       * @param {string} p.name the target file name
       * @param {object} [p.metadata] file metadata if required
       * @param {string|object|blob} [p.contentType] file contenttype if required
       * @param {boolean} [p.createIfMissing=true] create any missing folders in the given path
       * @param {string} p.payload the payload to upload - if its json and the contentType is application/json or not specified, it'll convert it
       * @param {...*} params any additional url params
       * @return {PackResponse} the file metadata
       */
      upload: ({ path, name, metadata, payload, createIfMissing = true, contentType }, ...params) => {
        let text = payload
        if (Utils.isUndefined(payload)) {
          return Utils.makeThrow({
            error: 'payload cannot be undefined for upload operation'
          })
        }

        // it's already a blob
        if (Utils.isBlob(payload)) {
          return self.upload({
            path: Utils.combinePath(ppath, path),
            name: pname || name, metadata,
            blob: payload,
            createIfMissing
          }, ...params)
        }

        // see if it can be parsed
        if ((!contentType || contentType.match(/^application\/json/)) && Utils.isObject(payload) && !Utils.isNull(payload)) {
          try {
            text = JSON.stringify(payload)
            contentType = contentType || 'application/json'
          }
          catch (err) {
            text = payload
          }
        }
        const blob = Utilities.newBlob(text, contentType || 'text/plain', name)
        return self.upload({
          path: Utils.combinePath(ppath, path),
          name: pname || name,
          metadata, blob,
          createIfMissing
        }, ...params)
      }

    }
  }

  _folderClosure({ id: pid, path: ppath, name: pname } = {}) {
    const self = this
    const folderQuery = `mimeType = '${this.folderMimeType}'`


    return {

      /**
       * get a file metadata
       * @param {object} p
       * @param {string} [p.path] the folder/file path
       * @param {string} [p.id] the target file id
       * @param {...*} params any additional api params
       * @return {PackResponse} the file metadata
      */
      get: ({ id, path, name } = {}, ...params) => self.get({
        query: folderQuery,
        id: id || pid,
        path: Utils.combinePath(ppath, path),
        name: pname || name
      }, ...params),

      page: (page) => {
        return {
          list: ({ query, path, name } = {}, ...params) => self.list({
            page,
            query: [query, folderQuery].filter(f => f).join(" "),
            path: Utils.combinePath(ppath, path), name: pname || name
          }, ...params)
        }
      },
      /**
       * list files in a given path
       * @param {object} p
       * @param {string} [p.path] the folder/file path
       * @param {string} [p.name] the target file name
       * @param {string} [p.query] any additional quiery filter
       * @param {...*} [params] any additional url params
       * @return {PackResponse} the list of matching items
       */
      list: ({ query, path, name } = {}, ...params) => self.list({
        query: [query, folderQuery].filter(f => f).join(" "),
        path: Utils.combinePath(ppath, path), name: pname || name
      }, ...params)

    }
  }
  /**
   * files domain
   * @return {object} containing the functions available in the files
   */
  get files() {
    const self = this

    return {
      ...self._fileClosure(),
      /**
       * files.path domain
       * @param {object} params
       * @param {string} [params.path] the folder/file path
       * @param {string} [params.name] the target file name
       * @param {string} [params.id] the target file id
       * @return {object} containing the functions available in the folders.path
      */
      path: ({ id, path, name } = {}) => self._fileClosure({ id, path, name })
    }
  }

  get folders() {
    const self = this

    return {
      ...self._folderClosure(),
      /**
       * files.path domain
       * @param {object} params
       * @param {string} [params.path] the folder/file path
       * @param {string} [params.name] the target file name
       * @param {string} [params.id] the target file id
       * @return {object} containing the functions available in the folders.path
      */
      path: ({ id, path, name } = {}) => self._folderClosure({ id, path, name })
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
   * @param {string} params.parentId the parent parentId
   * @param {string} params.title the name of the folder
   * @param {string} params.query any additional query filters
   * @return {object} the query
   */
  makeFolderQuery({ parentId, title, query }) {
    return this.makeQuery({ parentId, title }, query, `mimeType = '${this.folderMimeType}'`)
  }

  /**
   * make a file query
   * @param {object} params
   * @param {string} params.parentId the parent parentId
   * @param {string} params.title the name of the file
   * @param {string} params.query any additional query filters
   * @return {object} the query
   */
  makeFileQuery({ parentId, title, query }) {
    return this.makeQuery({ parentId, title }, query, `mimeType != '${this.folderMimeType}'`)
  }

  /**
   * make a mime parent query
   * @param {object} params
   * @param {string} params.parentId the parent parentId
   * @param {string} params.title the name of the file
   * @param {string} params.queries any additional query filters
   * @return {object} the query
   */
  makeQuery({ parentId, title }, ...queries) {
    const query = queries.filter(f => f).join(" and ")
    return this.makeParentQuery({ parentId, title, query })
  }

  /**
   * make a folder query involving a parent
   * @param {object} params
   * @param {string} params.parentId the parent parentId
   * @param {string} params.title the name of the folder
   * @param {string} params.query any additional query filters
   * @return {object} the query
   */
  makeParentQuery({ parentId, title, query }) {
    if (!parentId) throw 'parentId is missing for ' + title
    const q = [
      `'${parentId}' in parents`,
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
   * @param {string} params.query any additional query filters
   * @return {PackResponse} the file metadata
   */
  _getFile({ query }) {
    return this.proxy(this.filesPath + Utils.addParams([
      query
    ].concat(this.extraParams)))
  }

  /** 
   * get a folder metadata
   * @param {object} params
   * @param {string} params.parentId the parent parentId
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
      this.makeFolderQuery({ parentId, title })
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

    // start here
    let parent = this._getById({ id: 'root' }).throw()

    // final result
    const folders = [{
      folder: parent.data,
      path: '',
      error: parent.error
    }]

    let i = 0
    while (i < titles.length && !parent.error) {

      const parentId = folders[0].folder.id

      const path = titles.slice(0, i + 1).join("/")
      const title = titles[i]
      if (title) {
        parent = this._getFolder({ parentId, title, createIfMissing, path })
      } else {
        parent.error = 'blank folder name not allowed'
      }
      if (!parent.error) {
        folders.splice(0, 0, {
          folder: parent.data.files[0],
          path,
          error: parent.error
        })
      }

      i++
    }

    return {
      folders,
      result: Utils.makeThrow(parent)
    }


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
    const titles = Utils.isNUB(path) ? [] : path.replace(/^\//, '').replace(/\/$/, '').split("/")
    const res = this._getFolders({ titles, createIfMissing })
    const p = (res.folders && res.folders[0] && res.folders[0]) || {}
    const r = {
      ...res.result,
      data: {
        folders: res.folders,
        ...p.folder,
        path: p.path
      }
    }
    return Utils.makeThrow(r)
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
  _getById({ id }, ...params) {
    return this.proxy(`${this.makeFilePath({ id })}${Utils.addParams(params.concat(this.extraParams))}`)
  }

  /**
   * get a file part 
   * actually its just the name
   * @param {object} params
   * @param {string} params.path the file path
   * @return {string} the file name
   */
  getFilePath({ name }) {
    return name
  }

  /**
   * get a folder part
   * @param {object} params
   * @param {string} params.path the file path
   * @return {string} the file name
   */
  getFolderPath({ path }) {
    const p = `${this.base}${Utils.isNUB(path) ? '' : "/" + path}`
    return p
  }


  /**
   * create a metadata object
   * @param {object} params
   * @param {string} params.parentId the parent parentId
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

  _checkPathPars({ id, name, path }) {
    if (id && (path || name)) {
      return Utils.makeThrow({
        error: `you must supply a name property and optional path eg { name: 'xxx', path: 'folder/sub' } OR id {id:'xxx})`
      })
    }
    if (!name && !id) {
      return Utils.makeThrow({
        error: `you must supply a name property and optional path eg { name: 'xxx', path: 'folder/sub' })`
      })
    }
    return {}
  }
  /**
   * get a file metadata
   * @param {object} p
   * @param {string} [p.path] the folder/file path
   * @param {string} [p.name] the target file name
   * @param {string} [p.id] the target file id  
   * @param {string} params.params any additional api params
   * @return {PackResponse} the file metadata
   */
  // get an item
  get({ id, path, name, query } = {}, ...params) {

    // check param combination
    const t = this._checkPathPars({ id, name, path })
    if (t.error) return t


    // its an id find
    if (id) {
      return this._getById({ id }, ...params)
    }

    // first find the folder
    const folderPath = this.getFolderPath({ path })
    const pack = this.getFolders({ path: folderPath })
    if (pack.error) return pack

    // now get the list of matching files
    // note - will only return the first (most recenty modified) - there may be more than 1 and will be ignored
    const title = this.getFilePath({ name })

    // get the file
    const file = this._getFile({
      query: this.makeParentQuery({
        title,
        parentId: pack.data.id,
        query
      })
    })

    if (file.error) return file
    if (!file.data.files.length) {
      file.error = `file not found - ${folderPath} / ${title}`
      return Utils.makeThrow(file)
    } else {
      return this._getById({ id: file.data.files[0].id }, ...params)
    }
  }

  /**
   * convert file content by its id
   * @param {object} params
   * @param {string} params.id the file id
   * @param {string} params.contentType what to export 
   * @param {string} params.toPath where to put the file
   * @param {string} params.toName where to put the file
   * @param {boolean} params.createIfMissing=true
   * @return {PackResponse} the file content
   */
  _convertById({ id, contentType = null, toPath, toName, createIfMissing = true }, ...params) {
    // create a blob of the export
    const result = this._exportById({ id, contentType }, ...params)
    if (result.error) return result
    return this.upload({ path: toPath, name: toName, blob: result.blob, createIfMissing })

  }

  /**
   * export file content by its id
   * @param {object} params
   * @param {string} params.id the file id
   * @param {string} params.contentType what to export as
   * @return {PackResponse} the file content
   */
  _exportById({ id, contentType = null }, ...params) {
    // first get the file metadata
    const metaResult = this._getById({ id }, ...params)
    if (metaResult.error) return metaResult

    // now get the content
    const result = this.proxy(
      `${this.makeFilePath({ id })}/export${Utils.addParams([{ mimeType: contentType }].concat(this.extraParams))}`
    )
    if (result.error) return result
    // pass meta result of original file
    // exported data will be in the blob property
    if (result.data) {
      result.error = 'unexpected item in data area'
    } else {
      result.data = metaResult.data
      // set the blobname
      const ext = result.blob.getName().replace(/.*(\..*)$/, "$1")
      result.blob.setName(metaResult.data.name + ext)
    }
    // return the content
    return Utils.makeThrow(result)
  }

  /**
   * get a file content by its id
   * @param {object} params
   * @param {string} params.id the file id
   * @param {string} [params.contentType] override the content type specified in the files metadata if required
   * @return {PackResponse} the file metadata
   */
  _getContentById({ id, contentType = null }, ...params) {

    // first get the file metadata
    const metaResult = this._getById({ id }, ...params)
    if (metaResult.error) return metaResult

    // now get the content
    const result =
      this.proxy(`${this.makeFilePath({ id })}${Utils.addParams([{ alt: 'media' }].concat(this.extraParams))}`)
    if (result.error) return result

    // if its a parseable file, there wont be any blob, so we'll stick in a reference to it in case its preferred
    // if it came from cache, the fake response should handle it
    if (!result.blob) result.blob = result.response.getBlob()

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
   * @param {string} params.name the filename
   * @return {PackResponse} the file metadata
   */
  getContent({ path, contentType, name } = {}, ...params) {
    const result = this.get({ path, name }, ...params)
    if (result.error) return result
    return this._getContentById({ id: result.data.id, contentType })
  }

  /**
   * patch an a item by path
   * @param {object} params
   * @param {string} params.name the filename
   * @param {string} params.path the file path
   * @param {string} params.data complete file metadata
   * @return {PackResponse} the file metadata
   */
  patch({ path, data, name } = {}, ...params) {
    return this.set({
      path,
      name,
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

    // prepare initial resumable upload headers
    const bytes = blob.getBytes()
    const headers = {}

    /* Content - Type.Required if you have metadata for the file.
     * Set to application / json; charset = UTF - 8.
     */
    if (payload) {
      headers["Content-Type"] = "application/json; charset=UTF-8"
    }

    /* Content - Length.Required unless you use chunked transfer encoding.
     * Set to the number of bytes in the body of this initial request.
     * Note- NO need to set this param as urlfetch will caclulate automatically
     * in fact using .length will get it wrong anyway for chars > 1 bytes
     */


    /* X-Upload-Content-Type. Optional. 
     * Set to the MIME type of the file data, which is transferred in subsequent requests. 
     * If the MIME type of the data is not specified in metadata or through this header, 
     * the object is served as application/octet-stream.
    */
    const xContentType = blob.getContentType() && !(metadata && metadata.mimeType)
    if (xContentType) {
      headers["X-Upload-Content-Type"] = xContentType
    }

    /* X-Upload-Content-Length. Optional. 
     * Set to the number of bytes of file data, 
     * which is transferred in subsequent requests
     */
    if (bytes.length) {
      headers["X-Upload-Content-Length"] = bytes.length
    }

    // finalize the options
    const options = {
      method: "POST",
      headers
    }
    // add metadata
    if (payload) {
      options.payload = payload
    }

    // make the request
    const r1 = this.uploadProxy(path, options)
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

  get chunkIterator() {
    return (arr, size = this.maxPost) => Utils.chunkIt(arr, size)
  }

  resumableStatus({ location, size }) {
    const result = this.vanillaProxy(location, {
      method: "PUT",
      headers: {
        "CONTENT-RANGE": `bytes * /${size}`
      }
    })
    return result
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
    let result = {}
    let start = 0
    const size = this.maxPost

    // do each chunk
    while (!result.error && start < bytes.length) {
      const chunk = bytes.slice(start, Math.min(bytes.length, size + start))
      const end = chunk.length + start - 1
      // urlfetch calculates content-length automatically so no need to add here

      const headers = {
        "Content-Range": `bytes ${start}-${end}/${bytes.length}`
      }
      result = this.vanillaProxy(location, {
        method: "PUT",
        payload: chunk,
        headers
      })

      // we'll get a 308 if we're not done
      if (result.responseCode === 308) {
        // we're not done - check range makes sense
        const range = Utils.decipherRange(result.response.getHeaders().Range)
        if (range.error) {
          result.error = range.error
        } else if (range.start !== start) {
          result.error = `detected start of range chunk ${range.start} didn't match expected ${start}`
        } else if (range.end !== end) {
          result.error = `detected end of range chunk ${range.end} didn't match expected ${end}`
        } else {
          start = range.end + 1
        }

      } else {
        start += chunk.length
      }
    }

    // wrap up
    if (result.error) {
      return Utils.makeThrow(result)
    } else {
      // get the final status of the file
      const status = this.resumableStatus({ location, size: bytes.length })
      if (!status.error) {
        // delete the resulmable link
        const delStatus = this.vanillaProxy(location, {
          method: "DELETE"
        })
      }
      return status
    }

  }

  /**
   * upload a file to a path
   * @param {object} params
   * @param {string} params.path the target path
   * @param {string} params.name the filename
   * @param {object} [params.metadata] file metadata if required
   * @param {boolean} [createIfMissing=true] create any missing folders in the given path
   * @param {Blob} params.blob the blob to upload (should contain the metadata and the contentType as well as the bytes)
   * @param {...*} params.params any additional url params
   * @return {PackResponse} the file metadata
   */
  upload({ path, name, metadata, blob, createIfMissing = true }, ...params) {

    // the parent folder
    const folderPath = this.getFolderPath({ path })

    // the filename
    const title = this.getFilePath({ name })

    // get the id of the folderpath parent
    const folder = this.getFolders({ path: folderPath, createIfMissing })
    if (folder.error) return folder

    // the file metadata
    const meta = this.makeMetadata({
      parentId: folder.data.id,
      mimeType: blob.getContentType(),
      title
    })
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
    const result = this._hitResumableUpload({ location: init.location, blob })
    return result

  }

  get isCaching() {
    return this.superFetch.cacher.cacheable && !this.noCache
  }

  makeListCacheKey({ url, page }) {
    const key = this.superFetch.cacher.keyer(this.endPoint + url, { pageSize: page.pageSize, max: page.max })
    return key
  }

  initializeQuery({
    url,
    page
  }) {

    // make sure limit params are sensible
    page = this.optimizePage(this.maxChunk, 0, page)

    // this is a special key to be used for cache - cached items are written already baked
    const key = this.makeListCacheKey({ url: this.endPoint + url, page })
    return {
      page,
      key,
      url
    }
  }

  /**
   * list files in a given path
   * @param {object} p
   * @param {string} p.path the target folder path
   * @param {string} [p.name] the target filename
   * @param {string} [p.page] any paging info
   * @param {string} [p.query] any additional quiery filter
   * @param {object[]} params any additional url params
   * @return {PackResponse} the list of matching items
   */
  _list({ page, parentId, query, params, name }) {

    const initialUrl = this.filesPath + Utils.addParams(
      [this.makeParentQuery({ parentId, query })]
        .concat(this.extraParams)
        .concat(params)
        .concat(page.pageToken ? [{ pageToken: page.pageToken }] : []))

    const init = this.initializeQuery({ url: initialUrl, page })

    // optimize size of pages
    page = init.page
    const { key } = init

    // if we're  even doing cache here and we're not restarting a depage
    if (this.isCaching && !page.pageToken) {

      // pick up cached version
      const cached = this.superFetch.cacher.get(key)

      // undo the compression and remake standard shape
      const pack = this.superFetch.cacheUnLumper({}, cached)

      // we're done so add a throw method
      if (pack.cached) {
        if (this.showUrl) console.log(key, 'was cached')
        return Utils.makeThrow(pack)
      }
      if (this.showUrl) console.log(key, 'was not cached')
    }

    // we'll need a noCache version of the proxy as we don't need to partially cache
    const ref = this.ref(this.base, {
      noCache: true
    })

    // it wasn't in cache, so we neeed a getter
    const getter = (pageToken, items) => {
      const { pageSize, maxWait } = this.optimizePage(this.maxChunk, items.length, page)
      const url = this.filesPath + Utils.addParams(
        [this.makeParentQuery({ parentId, query })]
          .concat(this.extraParams)
          .concat([{ pageSize }])
          .concat(params)
          .concat(pageToken ? [{ pageToken }] : [])
      )
      const result = ref.proxy(url)
      const { rateLimit } = result
      // if it's a rate limit error then we might be able to go again
      if (rateLimit && rateLimit.fail) {
        if (rateLimit.waitFor && rateLimit.waitFor < maxWait) {
          console.log(`Hit a rate limit problem on ${url} - waiting for ${rateLimit.waitFor}ms and retrying`)
          Utilities.sleep(rateLimit.waitFor)
          return getter(pageToken, items)
        } else {
          console.log(`Trying to ratelimit wait for ${rateLimit.waitFor} cant wait longer than ${maxWait}`)
        }
      }
      return result
    }

    // this will be called until there's nothing else to get
    const localPager = (pager) => {
      // standard api get
      const result = getter(pager.pageToken, pager.items)

      // consoldate into items and expansions
      if (!result.error) {
        if (result.cached) {
          result.error = 'Unexpected cached result in search operation'
        } else {
          // standardized response
          Array.prototype.push.apply(pager.items, Utils.arrify(result.data.files))
        }
      }

      return {
        ...pager,
        result,
        pageToken: result && result.data && result.data.nextPageToken
      }
    }

    // initial call
    let pager = {
      items: [],
      // if this non null, then we're doing a restart of a depage
      pageToken: page.pageToken
    }

    do {
      pager = localPager(pager)
    } while (!pager.result.error && pager.pageToken && pager.items.length < page.max)

    // all done, tidy up
    // this is the result of the final regular fetch
    const pr = pager.result

    // on failure we don't want to do anything but fail
    if (!pr.error) {

      // replace the data part with the depaged consolidated items and expansions
      pr.data = {
        items: pager.items
      }

      // we only want to fiddle with cache if this an untainted get ie. doesn't involve a pageToken
      if (!page.pageToken) {

        if (this.isCaching) {
          // cache lumper is reponsible for rearranging the data for compression and later unpacking
          this.superFetch.cacher.set(key, this.superFetch.cacheLumper(pr))

        } else {

          // invalidate cache because we've done a fetch with no caching
          this.superFetch.cacher.remove(key)
        }
      }
      // add this pageToken in case they want to do some more paging
      pr.pageToken = pager.pageToken
    }

    return Utils.makeThrow(pr)
  }

  optimizePage(maxChunk, itemsSoFar = 0, page) {
    // how many max to go for
    if (!page) page = {
      max: this.max,
    }

    const maxWait = Utils.isNU(page.maxWait) ? this.maxWait : page.maxWait
    const max = Math.max((page.max || this.max) - itemsSoFar, this.minChunk)

    // pagesize needs to be a multiple of minChunk
    // set it to the nearest to max
    const pageSize = Math.min(maxChunk, Math.floor(((max - 1) + this.minChunk) / this.minChunk) * this.minChunk)

    return {
      pageToken: page.pageToken,
      max,
      pageSize,
      maxWait
    }
  }

  /**
   * list files in a given path
   * @param {object} p
   * @param {string} p.path the target folder path
   * @param {string} [p.name] the target filename
   * @param {string} [p.page] any paging info
   * @param {string} [p.query] any additional quiery filter
   * @param {object[]} params any additional url params
   * @return {PackResponse} the list of matching items
   */
  list({ page = {}, path, name, query = '' } = {}, ...params) {
    // first find the parent folder
    // TODO - filter on name
    const folders = this.getFolders({ path })
    if (folders.error) return folders
    const { data: folder } = folders
    return this._list({ page, parentId: folder.id, query, params, name })
  }

}



