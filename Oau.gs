/**
* @typedef OauApiOptions
* @property {_SuperFetch} superFetch a superfetch instance
* @property {boolean} noCache whether to cache
* @property {boolean} showUrl whether to showUrls when fetching
* @property {string} base any base to add to the endpoint
*/

class _OauApi {

  /**
   * @param {OauApiOptions} 
   * @return {_OauApi}
   */
  constructor({
    superFetch,
    noCache = false,
    showUrl,
    base = ''
  }) {
    this.base = base
    this.superFetch = superFetch
    this.showUrl = showUrl
    this.noCache = noCache
    this.proxy = superFetch.proxy({
      endPoint: `https://www.googleapis.com/oauth2/v1`,
      noCache,
      showUrl
    })
  }

  /**
   * create a new ref - which is just another instance of the class with a different base
   * @param {string} base a new base 
   * @param {OauApiOptions}
   * @return {_OauApi}
   */
  // create a new ref - which is just another instance of the class with a different base
  ref(base = '', {
    superFetch = this.superFetch,
    noCache = this.noCache,
    showUrl = this.showUrl
  } = {}) {
    return new _OauApi({
      showUrl,
      superFetch,
      noCache,
      base: Utils.singleSlash(this.base + (base ? '/' + base : ''))
    })
  }

  /**
   * closures
   * should be called like thse
   * oau.userInfo.get()
   */
  get userInfo() {
    const self = this
    const path = self.path({ path: 'userinfo' })
    return {
      get: (...params) => path.get({}, ...params)
    }
  }

  /**
   * closures
   * should be called like thse
   * oau.tokenInfo.get({token}) - default is the current token
   */
  get tokenInfo() {
    const self = this
    const path = self.path({ path: 'tokeninfo' })
    return {
      get: ({token}={},...params) => path.get(
        {},
        ...params.concat([{ access_token: token || this.superFetch.tokenService() }])
      )
    }
  }

  /**
   * @param {object} params
   * @param {string} params.path the path
   * @param {object[]} params.params any additional params
   * @return {string} the relative path
   */
  makePath({ path, params }) {
    return Utils.makeUrl({ url: Utils.makepath({ path, base: '/' + this.base }), params })
  }

  path({ path: pPath = '' } = {}, ...params) {
    const self = this
    return {
      /**
        * @param {object} params
        * @param {string} params.path the extra path
        * @param {...*} params.params any additional params
        * @return {PackResponse} the user info
        */
      get: ({ path = pPath } = {}, ...params) => self._get({ path }, ...params)
    }
  }

  get({ path } = {}, ...params) {
    return this._get({ path }, ...params)
  }

  /**
   * @param {object} params
   * @param {string} params.path the extra path
   * @param {...*} params.params any additional params
   * @return {PackResponse} the user info
   */
  _get({ path = '' } = {}, ...params) {
    return this.proxy(this.makePath({ path, params }))
  }

}



