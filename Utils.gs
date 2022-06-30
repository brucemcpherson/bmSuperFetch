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
    params = arrify(params).flat(Infinity)
    const pars = Array.from(params.flat(Infinity).reduce ((p,c)=> {
      Object.keys(c).forEach(k=>p.push([k,encoder(c[k])]))
      return p
    }, [])
    .reverse()
    .reduce ((p,c)=> {
      p.set(c[0], c[1])
      return p
    }, new Map())).sort((a,b)=> {
      if (a[0] === b[0]) return 0
      if (a[0] > b[0]) return 1
      return -1
    }).map(f=>f.join("="))
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
  const makepath = ({ path = '', base = '' }) => {
    return `${singleSlash(base + ((path && base) ? '/' : '') + path)}`
  }

  // create a URL with additional parameters
  const makeUrl = ({ url, params }) => {
    return `${url}${Utils.addParams(params)}`
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
    arrify,
    consolidate
  }

})()
