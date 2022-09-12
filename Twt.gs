/**
/**
 * @typedef TwtApiOptions
 * @property {SuperFetch} superFetch a superfetch instance
 * @property {boolean} noCache whether to cache
 * @property {boolean} stale whether to use stale cache processing
 * @property {string} staleKey key to use to get stale value
 * @property {boolean} showUrl whether to showUrls when fetching
 * @property {object[]} extraParams always add these params
 * @property {number} max to 
 * @property {number} maxWait maximum time to wait for a rate limit delay
 */

class _TwtApi {
  /**
   * @param {TwtApiOptions} options
   * @return {_TwtApi}
   */
  constructor(options) {
    const {
      noCache = true,
      superFetch,
      staleKey = 'twt',
      stale = true,
      showUrl = false,
      extraParams = [],
      max = 100,
      //  6 minutes
      maxWait = 60 * 6 * 1000
    } = {} = options

    // get a new instance of superfetch
    // replicating the settings, but adding whether to use stale/staleKey
    this.superFetch = superFetch.ref({
      stale,
      staleKey
    })

    // max number to get
    this.max = max

    // set by twitter API
    this.minChunk = 10

    // max params in url
    this.maxParams = 100

    this.maxWait = maxWait

    this.superFetch = superFetch

    // add rate limit info to pack
    const informer = (pack) => {
      const headers = pack.response.getHeaders()

      const limit = parseInt(headers['x-rate-limit-limit'], 10)
      const remaining = parseInt(headers['x-rate-limit-remaining'], 10)
      const reset = headers['x-rate-limit-reset'] * 1000
      const fail = pack.error && pack.responseCode === 429
      return {
        // the rate limit ceiling for that given endpoint
        limit,
        // the number of requests left for the 15-minute window
        remaining,
        // the remaining window before the rate limit resets timestamp
        reset,
        // whether it failed because of a rate limit problem
        fail,
        // if failed, how long to wait before trying again
        waitFor: !remaining ? reset - new Date().getTime() : 0
      }
    }
    // tell superFetch how to do it
    this.superFetch.setRateLimitInformer({
      informer
    })

    this.noCache = noCache
    this.extraParams = Utils.arrify(extraParams)
    this.showUrl = showUrl
    this.optionsTemplate = {
      headers: {
        "User-Agent": "SuperFetch-Twt"
      }
    }
    this.endPoint = `https://api.twitter.com/2`
    this.proxy = this.superFetch.proxy({
      endPoint: this.endPoint,
      noCache,
      showUrl
    })
    this.paths = {
      tweets: "/tweets",
      recent: "/search/recent",
      all: "/search/all",
      ids: "",
      users: "/users"
    }

    this.agenda = {
      get tweets() {
        const base = '/tweets'
        const basic = {
          joiner: " ",
          list: ["query"],
          paginate: true,
          query: 'query',
          maxChunk: 100
        }
        return {
          base,
          search: {
            ...basic,
            path: `${base}/search/recent`
          },
          recent: {
            ...basic,
            path: `${base}/search/recent`
          },
          all: {
            ...basic,
            path: `${base}/search/all`,
          },
          get: {
            query: 'ids',
            path: base,
            joiner: ",",
            paginate: false,
            list: ['ids', 'query']
          },
          counts: {
            ...basic,
            paginate: false,
            path: `${base}/counts/recent`
          },
          countsRecent: {
            ...basic,
            paginate: false,
            path: `${base}/counts/recent`
          },
          countsAll: {
            ...basic,
            paginate: false,
            path: `${base}/counts/all`
          }
        }
      },
      get users() {
        const base = "/users"
        const basic = {
          query: 'ids',
          path: base,
          joiner: ",",
          paginate: false,
          list: ['ids', 'query']
        }
        const basicFollow = {
          paginate: true,
          joiner: "",
          query: 'id',
          list: ['query', 'id'],
          path: `${base}/:id/following`,
          maxChunk: 1000
        }
        return {
          base,
          get: {
            ...basic
          },
          by: {
            ...basic,
            query: 'usernames',
            path: `${base}/by`,
            list: ['usernames', 'query']
          },
          me: {
            ...basic,
            query: null,
            path: `${base}/me`,
            list: []
          },
          following: {
            ...basicFollow
          },
          followers: {
            ...basicFollow,
            path: `${base}/:id/followers`,
          },
          blocking: {
            ...basicFollow,
            path: `${base}/:id/blocking`,
          },
          muting: {
            ...basicFollow,
            path: `${base}/:id/muting`,
          }
        }
      }
    }
  }

  /**
   * create a new ref - which is just another instance of the class with a different base
   * @param {TwtApiOptions}
   * @return {_TwtApi}
   */
  ref({
    noCache = this.noCache,
    superFetch = this.superFetch,
    showUrl = this.showUrl,
    extraParams = this.extraParams,
    max = this.max,
    stale = this.stale,
    staleKey = this.staleKey
  } = {}) {
    return new _TwtApi({
      superFetch,
      noCache,
      showUrl,
      extraParams,
      max,
      stale,
      staleKey
    })
  }

  /**
   * this is used to invalidate all cache entries
   * subscribing to this.staleKey
   * and should be issued after write operations
   */
  makeStale() {
    return this.isCaching ? this.superFetch.makeStale() : null
  }
  /**
   * this normalizes queries and combines strings and objects
   * for example query({ids: [1,2,3], query: [4,5]}).get([6,7])
   * becomes
   * [{ids: "1,2,3,4,5,6,7"}]
   */
  makeTheQuery(agenda, ...params) {
    if (!params.length) return params

    // because queries can be {ids=string| string[]},{query= string},{string}
    // need to convert that into agenda.query=all that joined
    const { query, list } = agenda
    const flat = params.flat(Infinity)

    // queries are not available on this endpoint
    if (!query) {
      if (flat.length) throw new Error(`Query parameters not allowed with ${agenda.path}`)
      return []
    }

    if (!list.includes(query)) throw new Error(`${query} not one of ${list.join(",")}`)

    const values = flat.map(f => {
      if (typeof f === 'string') return f
      const t = list.reduce((p, c) => {
        if (Reflect.has(f, c)) p.push(f[c])
        return p
      }, [])
      if (!t.length) {
        throw new Error(`parameter doesnt contain one of ${list.join(",")}`)
      }
      return t
    })

    const value = {}
    value[query] = values.flat(Infinity).join(agenda.joiner)
    return Utils.arrify(value)
  }

  /**
   * tweets collection
   */

  get tweets() {
    return this.domains(this.agenda.tweets)
  }
  get users() {
    return this.domains(this.agenda.users)
  }
  domains(agenda) {
    const self = this

    const rGet = ({
      method,
      agenda,
      page,
      query = '',
      params
    }) => {

      return self[method]({
        query: self.makeTheQuery(agenda, Utils.arrify(query)),
        params,
        agenda,
        page
      })
    }


    const searchClosure = ({ agenda, page, fields, query: extraQuery }) => {
      return {
        search: (query, ...params) => rGet({
          method: '_queryGet',
          agenda,
          query: self.makeTheQuery(agenda, Utils.arrify(extraQuery), Utils.arrify(query)),
          params: Utils.arrify(fields).concat(params),
          page
        }),
        deCache: (query, ...params) => rGet({
          method: '_deCache',
          agenda,
          query: self.makeTheQuery(agenda, Utils.arrify(extraQuery), Utils.arrify(query)),
          params: Utils.arrify(fields).concat(params),
          page
        })
      }
    }

    const countsClosure = ({ agenda, page, fields, query: extraQuery }) => {
      return {
        counts: (query, ...params) => rGet({
          method: '_queryGet',
          agenda,
          query: self.makeTheQuery(agenda, Utils.arrify(extraQuery), Utils.arrify(query)),
          params: Utils.arrify(fields).concat(params),
          page
        })
      }
    }


    const noMethod = (method) => {
      throw new Error(`method ${method} doesn't exist in this domain`)
    }

    const getClosuringId = ({ type, agenda, extraId, fields, page }) => {
      const ob = {}
      if (!agenda[type]) return ob

      ob[type] = agenda[type] ? (id, ...params) => rGet({
        method: '_queryGet',
        agenda: agenda[type],
        query: self.makeTheQuery(
          agenda[type],
          Utils.arrify(id),
          Utils.arrify(extraId)
        ),
        params: Utils.arrify(fields).concat(params),
        page
      }) : noMethod(type)
      return ob
    }

    const getClosure = ({ fields, query: extraQuery, ids: extraIds, usernames: extraUsernames, id: extraId, page } = {}) => {
      return {
        get: agenda.get ? (ids, ...params) => rGet({
          method: '_queryGet',
          agenda: agenda.get,
          query: self.makeTheQuery(
            agenda.get,
            Utils.arrify(extraIds),
            Utils.arrify(extraQuery),
            Utils.arrify(ids)
          ),
          params: Utils.arrify(fields).concat(params),
        }) : () => noMethod('get'),

        by: agenda.by ? (usernames, ...params) => rGet({
          method: '_queryGet',
          agenda: agenda.by,
          query: self.makeTheQuery(
            agenda.by,
            Utils.arrify(extraUsernames),
            Utils.arrify(extraQuery),
            Utils.arrify(usernames)
          ),
          params: Utils.arrify(fields).concat(params),
        }) : () => noMethod('by'),

        me: (...params) => agenda.me ? rGet({
          method: '_queryGet',
          agenda: agenda.me,
          query: self.makeTheQuery(
            agenda.me
          ),
          params: Utils.arrify(fields).concat(params),
        }) : () => noMethod('me'),
        ...getClosuringId({ type: 'following', agenda, extraId, fields, page }),
        ...getClosuringId({ type: 'muting', agenda, extraId, fields, page }),
        ...getClosuringId({ type: 'blocking', agenda, extraId, fields, page }),
        ...getClosuringId({ type: 'followers', agenda, extraId, fields, page })
      }
    }

    /**
      * generalized query 
     */
    const rQuery = ({ fields, query, ids, usernames, id } = {}) => {
      return {
        ...searchClosure({ agenda: agenda.search, fields, query }),
        ...countsClosure({ agenda: agenda.counts, fields, query }),
        ...getClosure({ fields, query, ids, usernames, id }),
        page: (page) => ({
          ...searchClosure({ agenda: agenda.search, page, fields, query }),
          ...getClosure({ fields, query, id, page })
        })
      }
    }

    return {
      ...searchClosure({ agenda: agenda.search }),
      ...countsClosure({ agenda: agenda.counts }),
      ...getClosure(),

      page: (page) => {
        return {
          ...searchClosure({ agenda: agenda.search, page }),
          ...getClosure({ page })
        }
      },

      query: (options) => rQuery(options),

      get recent() {
        return {
          ...searchClosure({ agenda: agenda.recent }),
          ...countsClosure({ agenda: agenda.countsRecent })
        }
      },

      get all() {
        return {
          ...searchClosure({ agenda: agenda.all }),
          ...countsClosure({ agenda: agenda.countsAll })
        }
      }
    }
  }

  optimizePage(maxChunk, itemsSoFar = 0, page) {
    // how many max to go for
    if (!page) page = {
      max: this.max,
    }
    const maxWait = Utils.isNU(page.maxWait) ? this.maxWait : page.maxWait
    const max = Math.max(page.max - itemsSoFar, this.minChunk)

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

  get chunkIterator() {
    return (arr, size = this.maxParams) => Utils.chunkIt(arr, size)
  }

  makeListCacheKey({ url, page }) {
    const key = this.superFetch.cacher.keyer(this.endPoint + url, { pageSize: page.pageSize, max: page.max })
    return key
  }

  get isCaching() {
    return this.superFetch.cacher.cacheable && !this.noCache
  }



  initializeQuery({
    agenda,
    query,
    params,
    page
  }) {

    // make sure limit params are sensible
    page = this.optimizePage(agenda.maxChunk, 0, page)

    // add the query String
    params = params.concat(query)

    // this is the path for the initial fetch
    const initialPath = agenda.path
    const url = this.makePath({ path: initialPath, params })

    // this is a special key to be used for cache - cached items are written already baked
    const key = this.makeListCacheKey({ url: this.endPoint + url, page })
    return {
      page,
      params,
      key,
      initialPath,
      agenda
    }
  }

  _deCache(options) {
    const cacheable = this.superFetch.cacher.cacheable

    if (cacheable) {
      const { key } = this.initializeQuery(options)
      this.superFetch.cacher.remove(key)
    }
    return Utils.makeThrow({
      cached: cacheable
    })
  }


  _queryGet(options) {
    const self = this

    const { page, params, key, initialPath, agenda } = this.initializeQuery(options)

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
    const ref = this.ref({
      noCache: true
    })

    // it wasn't in cache, so we neeed a getter
    const getter = (pageToken, items) => {
      const { pageSize, maxWait } = this.optimizePage(agenda.maxChunk, items.length, page)
      const mr = agenda.paginate ? [{
        max_results: pageSize
      }] : []

      const url = this.makePath({
        path: initialPath,
        params: params.concat(mr, pageToken ? [{ pagination_token: pageToken }] : [])
      })
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
          // standardized this odd twitter response
          Array.prototype.push.apply(pager.items, Utils.arrify(result.data.data))
          Array.prototype.push.apply(pager.expansions,
            Utils.arrify(Object.keys(result.data)
              .filter(f => f != 'data' && f !== 'meta')
              .reduce((p, c) => {
                p[c] = result.data[c]
                return p
              }, {})))

        }
      }

      return {
        ...pager,
        result,
        pageToken: result && result.data && result.data.meta && result.data.meta.next_token
      }
    }

    // initial call
    let pager = {
      items: [],
      expansions: [],
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
        items: pager.items,
        expansions: Utils.consolidate(pager.expansions)
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

  /**
   * this is a helper to consolidate an array of results
   * @param {PackResponse.data} data
   * @return {PackResponse.data}
   */
  packFlattener(data) {
    const result = data.reduce((p, c) => {
      Array.prototype.push.apply(p.items, c.items)
      Array.prototype.push.apply(p.expansions, Utils.arrify(c.expansions))
      return p
    }, {
      items: [],
      expansions: []
    })
    return {
      items: result.items,
      expansions: Utils.consolidate(result.expansions)
    }
    return result
  }

  makePath({ path, params }) {
    return Utils.makeUrl({
      url: Utils.makepath({ path, base: '' }),
      params: params.concat(this.extraParams)
    })
  }



}