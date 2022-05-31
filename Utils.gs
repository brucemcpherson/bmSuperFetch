const Utils = (() => {

  const arrify = (item) => Array.isArray(item) ? item : (isNU(item) ? [] : [item])

  const encoder = (str) => {
    return encodeURIComponent(str)
  }

  // firebase is a stricter encoder
  const frbEncoder = (str) => encoder(str).replace(/[\.\#\$\[\]]/g, c =>
    '%' + c.charCodeAt(0).toString(16))

  singleSlash = (url) => {
    const s = url.replace(/\/+/g, '/')
    return s === '/' ? '' : s
  }

  const isUndefined = (item) => typeof item === typeof undefined
  const isNull = (item) => item === null
  const isNU = (item) => isNull(item) || isUndefined(item)

  const plucker = (obj, props = []) => props.reduce((p, prop) => {
    if (!isNU(obj[prop])) {
      p[prop] = obj[prop]
    }
    return p
  }, {})

  const addParams = (params) => {
    params = arrify(params)
    const pars = params.reduce((p, c) => {
      Object.keys(c).forEach(k => p.push([k, encoder(c[k])].join('=')))
      return p
    }, [])

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
  const makepath = ({ path, base }) => {
    return `${singleSlash(base + ((path && base) ? '/' : '') + path)}`
  }

  // create a URL with additional parameters
  const makeUrl = ({ url, params }) => {
    return `${url}${Utils.addParams(params)}`
  }



  const pager = (proxy) => {
    const pager = (pageToken, items = []) => {
      const result = proxy(pageToken)
      if (!result.error) {
        Array.prototype.push.apply(items, result.data.items)
      }
      return {
        result,
        items
      }
    }
    // first call with no next pagetoken
    let pack = pager()
    let { cached } = pack.result
    // keep going till we don't get a next page token
    while (!pack.result.error && pack.result.data.nextPageToken) {
      cached = cached && pack.result.cached
      const pageToken = pack.result.data.nextPageToken
      pack = pager(pageToken, pack.items)
    }
    if (!pack.result.error) pack.result.data.items = pack.items
    pack.result.cached = pack.result.cached && cached
    return pack.result
  }

  const makeThrow = (pack) => {

    // add a throw method shortcut
    pack.throw = pack.error
      ? () => {
        throw new Error(pack.error)
      }
      : () => pack

    return pack
  }

  return {
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
    plucker,
    makepath,
    makeUrl,
    pager,
    makeChunkIterator,
    arrify
  }

})()
