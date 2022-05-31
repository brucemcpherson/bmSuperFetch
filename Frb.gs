/**
 * @typedef FrbApiOptions
 * @property {_SuperFetch} superFetch a superfetch instance
 * @property {boolean} noCache whether to cache
 * @property {string} dbName the firebase database name
 * @property {string} base the base path on the bucket (all paths will be relative to this)
 * @property {boolean} showUrl whether to showUrls when fetching
 * @property {object[]} extraParams always add these params
 */
class _FrbApi {
  /**
   * @param {FrbApiOptions} params
   * @return {_FrbApi}
   */
  constructor({
    noCache = true,
    dbName,
    base = '',
    superFetch,
    showUrl = false,
    extraParams = []
  } = {}) {
    this.base = base
    this.superFetch = superFetch
    this.dbName = dbName
    this.noCache = noCache
    this.extraParams = Utils.arrify(extraParams)
    this.showUrl = showUrl
    this.proxy = superFetch.proxy({
      endPoint: `https://${this.dbName}.firebaseio.com`,
      noCache,
      showUrl
    })
  }

  /**
   * create a new ref - which is just another instance of the class with a different base
   * @param {string} base a new base 
   * @param {FrbApiOptions}
   * @return {_FrbApi}
   */
  ref(base = '', {
    noCache = this.noCache,
    superFetch = this.superFetch,
    dbName = this.dbName,
    showUrl = this.showUrl,
    extraParams = this.extraParams
  } = {}) {
    return new _FrbApi({
      superFetch,
      noCache,
      dbName,
      showUrl,
      extraParams,
      base: Utils.singleSlash(this.base + (base ? '/' + base : ''))
    })
  }

  /**
   * path domain
   * @param {object} params
   * @param {string} params.path the folder/file path
   * @return {object} containing the functions available in the path domain
  */
  path({ path = '' } = {}) {
    const self = this
    return {
      /**
       * get object
       * @param {...*} params any additional api params
       * @return {PackResponse} standard response with data from firebase in .data
       */
      get: (...params) => self.get({ path }, ...params),

      /**
       * set object
       * @param {object} p
       * @param {object} p.data the data to write
       * @param {...*} params any additional api params
       * @return {PackResponse} standard response with data from firebase in .data
       */
      set: ({ data }, ...params) => self.set({ path, data, method: "PUT" }, ...params),

      /**
       * patch object
       * @param {object} p
       * @param {object} p.data the data to patch
       * @param {...*} params any additional api params
       * @return {PackResponse} standard response with data from firebase in .data
       */
      patch: ({ data }, ...params) => self.set({ path, data, method: "PATCH" }, ...params)

    }
  }

  makePath({ path, params }) {
    return Utils.makeUrl({
      url: Utils.makepath({ path, base: '/' + this.base }) + ".json",
      params: params.concat(this.extraParams)
    })
  }

  // get an item
  get({ path = '' } = {}, ...params) {
    return this.proxy(this.makePath({ path, params }))
  }

  // set an item
  set({ path = '', data, method = "PUT" }, ...params) {
    return this.proxy(this.makePath({ path, params }), {
      method,
      payload: JSON.stringify(data)
    })
  }
}