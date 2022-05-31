/**
 * @typedef GtbApiOptions
 * @property {_SuperFetch} superFetch a superfetch instance
 * @property {boolean} [noCache=true] whether to cache
 * @property {boolean} [showUrl=false] whether to showUrls when fetching
 * @property {string} [endPoint] alternative endpoint
 * @property {object[]} [extraParams] always add these params
 */
class _GtbApi {
  // default is the development endpoint for gotenberg
  // normally the endpoint is going to be a cloudrun endpoint
  /**
   * @param {GtbApiOptions} params
   * @return {_GtbApi}
   */
  constructor({
    noCache = true,
    superFetch,
    endPoint = `https://demo.gotenberg.dev`,
    showUrl = false,
    extraParams = []
  } = {}) {
    this.noCache = noCache
    this.superFetch = superFetch
    this.extraParams = Utils.arrify(extraParams)
    this.proxy = superFetch.proxy({
      endPoint,
      noCache,
      showUrl
    })
  }

  /**
   * create a new ref - which is just another instance of the class with a different base
   * @param {string} base a new base 
   * @param {GtbApiOptions}
   * @return {_GtbApi}
   */
  // create a new ref 
  ref(base = '', {
    superFetch = this.superFetch,
    noCache = this.noCache,
    endPoint = this.endPoint,
    showUrl = this.showUrl,
    extraParams = this.extraParams
  } = {}) {
    return new _DrvApi({
      superFetch,
      endPoint,
      noCache,
      showUrl,
      extraParams
    })
  }

  health() {
    return this.proxy('/health')
  }

  ping() {
    const t = new Date().getTime()
    const response = this.health()
    console.log(response.data)
    const ready = Boolean(!response.error && response.data.status === 'up')
    if (ready) {
      response.data.ready = true
      response.data.ms = new Date().getTime() - t
    }
    return response
  }

  get defaultConvertPath() {
    return '/forms/libreoffice/convert'
  }

  convert({ blob, path = this.defaultConvertPath }, ...params) {
    return this.proxy(this.makePath({ path, params }), {
      method: "POST",
      payload: {
        attachment1: blob
      }
    })
  }

  makePath({ path, params }) {
    return Utils.makeUrl({ url: Utils.makepath({ path, base: '' }), params })
  }

}




