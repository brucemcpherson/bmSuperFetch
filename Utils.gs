const Utils = (() => {

  const arrify = (item) => Array.isArray(item) ? item : (isNU(item) ? [] : [item])

  /**
   * [ { includes: { users: [Object] } },
  { includes: { users: [Object] } },
  { includes: { users: [Object] } } ]
   becomes { includes : { users: [] }}
   */
  const consolidate = (expansions) => {

    return expansions.reduce((p, c) => {

      Object.keys(c).forEach(k => {
        if (Array.isArray(c[k])) {
          if (!p[k]) p[k] = []
          Array.prototype.push.apply(p[k], c[k])
        } else {
          if (!p[k]) p[k] = {}
          Object.keys(c[k]).forEach(t => {
            if (!p[k][t]) p[k][t] = []
            Array.prototype.push.apply(p[k][t], c[k][t])
          })
        }
      })
      return p
    }, {})
  }

  const encoder = (str) => {
    return encodeURIComponent(str)
  }

  // firebase is a stricter encoder
  const frbEncoder = (str) => encoder(str).replace(/[\.\#\$\[\]]/g, c =>
    '%' + c.charCodeAt(0).toString(16))

  const singleSlash = (url) => {
    const s = url.replace(/\/+/g, '/')
    return s === '/' ? '' : s
  }
  const combinePath = (...params) => {
    const r = params.reduce((p, c) => {
      if (!isNUB(c)) {
        Array.prototype.push.apply(p, c.split('/'))
      }
      return p
    }, [])
    return singleSlash(r.join('/'))
  }

  const isUndefined = (item) => typeof item === typeof undefined
  const isNull = (item) => item === null
  const isNU = (item) => isNull(item) || isUndefined(item)
  const isNUB = (item) => isNU(item) || item === ''

  const plucker = (obj, props = []) => props.reduce((p, prop) => {
    if (!isNU(obj[prop])) {
      p[prop] = obj[prop]
    }
    return p
  }, {})

  /**
   * some params go as regular url params ?id=x
   * other are substitutes like this /:id/ unless skipSub is true
   */
  const filterParams = (url, params, skipSub) => {
    const exploded = explodeParams(params)
    // we'll pick up any params that are of this style :id
    const matches = !skipSub && url.match(/:\w+/gi)

    if (!matches || !matches.length) return {
      url,
      pars: exploded.map(f => f.join("="))
    }
    const compareKey = (matchKey, explode) => matchKey === ':' + explode[0]

    // check that we have them and make a new url
    const pars = exploded.filter(e => !matches.find(f => compareKey(f, e))).map(f => f.join("="))
    const inline = exploded.filter(e => matches.find(f => compareKey(f, e)))


    matches.forEach(m => {
      const il = inline.find(f => compareKey(m, f))
      if (!il) throw new Error(`Couldnt find required inline parameter ${m}`)
      url = url.replace(`${m}`, il[1])
    })

    return {
      url,
      pars
    }
  }
  const explodeParams = (params) => {
    return Array.from(params.flat(Infinity).reduce((p, c) => {
      Object.keys(c).forEach(k => p.push([k, encoder(c[k])]))
      return p
    }, [])
      .reverse()
      .reduce((p, c) => {
        p.set(c[0], c[1])
        return p
      }, new Map())).sort((a, b) => {
        if (a[0] === b[0]) return 0
        if (a[0] > b[0]) return 1
        return -1
      })
  }

  const addParams = (params) => {
    params = arrify(params).flat(Infinity)
    const pars = explodeParams(params).map(f => f.join("="))
    return pars.length ? `?${pars.join('&')}` : ''
  }

  const delay = (ms) => new Promise(resolve => {
    Utilities.sleep(ms)
    resolve(ms)
  })

  const poller = async ({ ms = 10000, action, tries = 1 }) => {
    await delay(ms)
    const r = action({ ms, tries })
    if (!r) poller({ ms, action, tries: tries + 1 })
    return r
  }

  const decipherRange = (response) => {

    const headers = response.getHeaders()
    const { 'Range': range, 'Content-Type': contentType } = headers
    if (!range) return {
      error: "cant decipher range - it's missing"
    }
    const rx = /^(\w+)=(\d+)-(\d+)$/
    const matches = range && range.replace(rx, '$1,$2,$3').split(",")
    const [unit, start, end] = matches || []

    return {
      range,
      unit,
      start: parseInt(start, 10),
      end: parseInt(end, 10),
      contentType,
      headers
    }


  }

  const decipherContent = (response) => {

    // eg Content-Range: bytes 0-524287
    const headers = response.getHeaders()

    const { 'Content-Range': contentRange, 'Content-Length': contentLength, 'Content-Type': contentType } = headers

    const rx = /^(\w+)\s+(\d+)-(\d+)\/(\d+)$/
    const matches = contentRange && contentRange.replace(rx, '$1,$2,$3,$4').split(",")
    const [unit, start, end, size] = matches || []

    return {
      contentRange,
      unit,
      start: parseInt(start, 10),
      end: parseInt(end, 10),
      size: parseInt(size, 10),
      contentLength: parseInt(contentLength, 10),
      contentType,
      headers
    }
  }

  const makeChunkIterator = ({ arr, size, start = 0, end }) => {

    // default is the entire array
    if (isUndefined(end)) {
      end = arr.length
    }

    // return how many chunks there were
    let numberChunks = 0

    // the iterator
    return {

      next() {
        if (start < end) {
          const value = {
            chunk: arr.slice(start, Math.min(start + size, end)),
            numberChunks,
            start,
            done: false
          }
          start += value.chunk.length
          numberChunks++
          return value
        } else {
          return {
            done: true,
            numberChunks
          }
        }
      }
    }
  }

  const chunker = (inputArray, size) => {
    const chunks = []
    const items = inputArray.slice()
    while (items.length) chunks.push(items.splice(0, size))
    return chunks
  }

  // enhance the path with any additional path info
  const makepath = ({ path = '', base = '' }) => {
    return `${singleSlash(base + ((path && base) ? '/' : '') + path)}`
  }

  // create a URL with additional parameters
  const makeUrl = ({ url, params, skipSub = false }) => {
    const { pars, url: patchedUrl } = filterParams(url, params, skipSub)
    const uriPars = pars.length ? `?${pars.join('&')}` : ''
    return `${patchedUrl}${uriPars}`
  }


  const pager = (proxy, limit = { max: Infinity, start: 0, maxResults: 0 }) => {

    const localPager = (pageToken, items = [], expansions = []) => {
      const result = proxy(pageToken, items)
      if (!result.error && !result.cached) {
        Array.prototype.push.apply(items, result.data.items)
        Array.prototype.push.apply(expansions, result.data.expansions)
      }

      const pack = {
        result,
        items,
        expansions
      }

      return pack
    }
    // first call with no next pagetoken
    let pack = localPager()
    if (pack.result.cached) return pack.result

    // keep going till we don't get a next page token
    while (!pack.result.error && pack.result.data.nextPageToken && pack.items.length < limit.max) {
      const pageToken = pack.result.data.nextPageToken
      pack = localPager(pageToken, pack.items, pack.expansions)
    }
    const pr = pack.result
    if (!pr.error) {
      pr.data.items = pack.items
      pr.data.expansions = pack.expansions
    }
    return pr
  }

  const makeThrow = (pack) => {

    // add a throw method shortcut
    pack.throw = pack.error
      ? () => {
        throw new Error(pack.error)
      }
      : () => pack

    // add an asString
    pack.asString = () => (pack.response && pack.response.getContentText && pack.response.getContentText()) || null
    return pack
  }

  const chunkIt = (inputArray, size, start = 0, end = inputArray.length) => {
    return {
      *[Symbol.iterator]() {
        while (start < end) {
          const chunk = inputArray.slice(start, Math.min(end, size + start))
          start += chunk.length
          yield chunk
        }
      }
    }
  }

  /** 
  * isObject
  * check if an item is an object
  * @param {object} obj an item to be tested
  * @return {boolean} whether its an object
  **/
  const isObject = (obj) => obj === Object(obj);
  const isBlob = (blob) => isObject(blob) && blob.toString() === 'Blob'
  const isArray = (item) => Array.isArray(item)
  const isByteArray = (item) => isArray(item) && !isUndefined(item.byteLength)
  const papply = (item, itemToAdd) => {
    Array.prototype.push.apply(item, itemToAdd)
    return item
  }

  /**
   * convert an array of things to bytes
   * @param {*[]} items to be converted
   * @return {byte[]} converteed
   */
  const toBytes = (items) => {
    if (isUndefined(items)) throw 'refuse to convert undefined to bytes'
    return Utilities.newBlob(JSON.stringify(items)).getBytes()
  }

  const uuid = () => Utilities.getUuid()

  const makeTankFiller = ({ stream, fetcher }) => {
    return (tank) => {
      // init didnt happen propery
      if (Utils.isNU(stream.size)) {
        throw error`couldnt find data size to stream - stream not initialized properly`
      }
      if (stream.error) {
        throw new Error(stream.error)
      }
      // make the range
      const { start, size, name, isMore, lastStatus, contentType } = stream
      const end = Math.min(start + tank.capacity, size) - 1
      const range = `bytes=${start}-${end}`

      // no more data - signal end
      if (!isMore) {
        return {
          items: null
        }
      }

      // should never happen
      if (start > size) {
        console.log('starts too big')
        throw `${name} trying to downloade from ${start} bytes: expected only ${size}`
      }

      // fetch the data
      const ru = fetcher({ range })

      // check the response headers that all went according to plan
      const content = Utils.decipherContent(ru.response)

      stream.lastStatus = ru.responseCode
      stream.error = ru.error

      // halt tank if an error
      if (ru.error) {
        console.log('readstream:there was an error', ru.error)
        return {
          error: ru.error
        }
      }

      // get the bytes returned
      const items = ru.response.getBlob().getBytes()


      // set next fetch
      stream.bytesLength = items.length

      if (stream.bytesLength !== content.contentLength) {
        throw `got ${stream.bytesLength} bytes but should have been ${content.contentLength}`
      }
      if (start !== content.start || end !== content.end || size !== content.size) {
        throw `got ${content.contentRange} but expected ${range}`
      }
      if (contentType !== content.contentType) {
        throw `got ${content.contentRange} but expected ${contentType}`
      }
      stream.start += stream.bytesLength


      // commit to tank
      return {
        items
      }
    }
  }

  const roundUpCapacity = (capacity) => {
    // set tank capacity to multiple of 256k
    const roundedCapacity = Math.ceil(capacity / (256 * 1024)) * 256 * 1024
    if (roundedCapacity !== capacity) {
      console.log(`Automatically rounded up capacity from ${capacity} to ${roundedCapacity}`)
      capacity = roundedCapacity
    }
    return capacity
  }


  return {
    roundUpCapacity,
    makeTankFiller,
    toBytes,
    papply,
    isArray,
    isByteArray,
    isObject,
    isBlob,
    chunkIt,
    makeThrow,
    chunker,
    encoder,
    addParams,
    delay,
    poller,
    singleSlash,
    frbEncoder,
    isUndefined,
    isNull,
    isNU,
    isNUB,
    plucker,
    makepath,
    makeUrl,
    pager,
    makeChunkIterator,
    arrify,
    consolidate,
    decipherRange,
    decipherContent,
    combinePath,
    uuid
  }

})()
