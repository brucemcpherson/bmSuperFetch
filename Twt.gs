/**
/**
 * @typedef TwtApiOptions
 * @property {SuperFetch} superFetch a superfetch instance
 * @property {boolean} noCache whether to cache
 * @property {boolean} showUrl whether to showUrls when fetching
 * @property {object[]} extraParams always add these params
 * @property {number} max to get
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
      showUrl = false,
      extraParams = [],
      max = 100
    } = {} = options

    // max number to get
    this.max = max

    // set by twitter API
    this.minChunk = 10
    this.maxChunk = 100

    this.superFetch = superFetch
    this.noCache = noCache
    this.extraParams = Utils.arrify(extraParams)
    this.showUrl = showUrl
    this.optionsTemplate = {
      headers: {
        "User-Agent": "SuperFetch-Twt"
      }
    }
    this.endPoint = `https://api.twitter.com/2`
    this.proxy = superFetch.proxy({
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
    const joiner = " "
    const paginate = true
    const list = ['query']
    this.agenda = {
      get tweets() {
        const base = '/tweets'
        return {
          base,
          search: {
            query: 'query',
            path: `${base}/search/recent`,
            joiner,
            paginate,
            list
          },
          recent: {
            query: 'query',
            path: `${base}/search/recent`,
            joiner,
            paginate,
            list
          },
          all: {
            query: 'query',
            path: `${base}/search/all`,
            joiner,
            paginate,
            list
          },
          get: {
            query: 'ids',
            path: base,
            joiner: ",",
            paginate: false,
            list: ['ids', 'query']
          }
        }
      },
      get users() {
        const base = "/users"
        return {
          base,
          get: {
            query: 'ids',
            path: base,
            joiner: ",",
            paginate: false,
            list: ['ids', 'query']
          },
          by: {
            query: 'usernames',
            path: `${base}/by`,
            joiner: ",",
            paginate: false,
            list: ['usernames', 'query']
          },
          me: {
            query: null,
            path: `${base}/me`,
            joiner: "",
            paginate: false,
            list: []
          },
          // TODO
          following: {

          },
          followers: {

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
    max = this.max
  } = {}) {
    return new _TwtApi({
      superFetch,
      noCache,
      showUrl,
      extraParams,
      max
    })
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

    const noMethod = (method) => {
      throw new Error(`method ${method} doesn't exist in this domain`)
    }

    const getClosure = ({ fields, query: extraQuery, ids: extraIds, usernames: extraUsernames } = {}) => {
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
        }) : () => noMethod('me')
      }
    }

    /**
      * generalized query 
     */
    const rQuery = ({ fields, query, ids, usernames } = {}) => {
      return {
        ...searchClosure({ agenda: agenda.search, fields, query }),
        ...getClosure({ fields, query, ids, usernames }),
        page: (page) => searchClosure({ agenda: agenda.search, page, fields, query }),
      }
    }

    return {
      ...searchClosure({ agenda: agenda.search }),
      ...getClosure(),

      page: (page) => searchClosure({ agenda: agenda.search, page }),

      query: (options) => rQuery(options),

      get recent() {
        return searchClosure({ agenda: agenda.recent })
      },

      get all() {
        return searchClosure({ agenda: agenda.all })
      }
    }
  }

  optimizePage(itemsSoFar = 0, page) {
    // how many max to go for
    if (!page) page = {
      max: this.max
    }
    const max = Math.min(this.maxChunk, Math.max(page.max - itemsSoFar, this.minChunk))

    // pagesize needs to be a multiple of minChunk
    // set it to the nearest to max
    const pageSize = Math.floor(((max - 1) + this.minChunk) / this.minChunk) * this.minChunk
    return {
      startToken: page.startToken,
      max,
      pageSize
    }
  }

  makeListCacheKey({ url, page }) {
    const key = this.superFetch.cacher.keyer(this.endPoint + url, { pageSize: page.pageSize, max: page.max })
    return key
  }

  get isCaching() {
    return this.superFetch.cacher.cacheable && !this.noCache
  }

  tryCache({ url, page }) {
    // we're not even doing cache here
    if (!this.isCaching) return {
      cached: false
    }

    // this is a special key to be used for cache - cached items are writed already baked
    const key = this.makeListCacheKey({ url, page })

    if (pack.cached) {
      // undo the cache wrapping and add a throw method
      return Utils.makeThrow(this.superFetch.cacheUnLumper(pack, cached))
    }
  }


  initializeQuery({
    agenda,
    query,
    params,
    page
  }) {

    // make sure limit params are sensible
    page = this.optimizePage(0, page)

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
  }

  _queryGet(options) {
    const self = this

    const { page, params, key, initialPath, agenda } = this.initializeQuery(options)

    // if we're  even doing cache here and we're not restarting a depage
    if (this.isCaching && !page.startToken) {

      // pick up cached version
      const cached = this.superFetch.cacher.get(key)

      // undo the compression and remake standard shape
      const pack = this.superFetch.cacheUnLumper({}, cached)

      // we're done so add a throw method
      if (pack.cached) {
        console.log(key, 'was cached')
        return Utils.makeThrow(pack)
      }
      console.log(key, 'was not cached')
    }

    // we'll need a noCache version of the proxy as we don't need to partially cache
    const ref = this.ref({
      noCache: true
    })

    // it wasn't in cache, so we neeed a getter
    const getter = (pageToken, items) => {
      const { pageSize } = this.optimizePage(items.length, page)
      const mr = agenda.paginate ? [{
        max_results: pageSize
      }] : []

      const url = this.makePath({
        path: initialPath,
        params: params.concat(mr, pageToken ? [{ pagination_token: pageToken }] : [])
      })
      return ref.proxy(url)
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
      pageToken: page.startToken
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

      // we only want to fiddle with cache if this an untainted get ie. doesn't involve a startToken
      if (!page.startToken) {

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


  makePath({ path, params }) {
    return Utils.makeUrl({
      url: Utils.makepath({ path, base: '' }),
      params: params.concat(this.extraParams)
    })
  }



}