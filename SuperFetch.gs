/**
 * @typedef SuperFetchOptions
 * @property {CacheService || null} cacheService an apps script cacheservice to use - leave null for no caching
 * @property {FetchApp} fetcherApp the fetch service (url fetch app)
 * @property {function} tokenService the token service to return a an access token
 * @property {number} [expiry=60 * 60 * 1] default cache expiry
 * @property {string} [prefix='superfetch'] default usually it's just to separate cache entries if necessary
 * @property {boolean} [missingPropertyIsFatal = true] proxy will throw if attempt to access a missing property
 * @property {Rottler} [rottler] rottler for throttling calls (https://ramblings.mcpher.com/vuejs-apps-script-add-ons/rate-limit/)
 */

/**
 * simulates httpresponse when result is in cache
 * @typedef CachedHttpResponse
 * @property {number} responseCode the httpResponse
 * @property {object} headers the responseheaders
 */

/**
 * faked httpresponse when result is from cache
 * @typedef FakeHttpResponse
 * @property {function} getResponseCode the original response code
 * @property {object} getHeaders the original responseheaders
 * @property {function} getContentText gets the original text
 */

/**
 * simulates blob when result is in cache
 * @typedef CachedBlob
 * @property {string} bytes the blobs bytes as base64 string
 * @property {string} name the blobs name
 * @property {string} contentType the blobs content type
 */

/**
 * This is created to write to cache to recreate the httpresponse
 * @typedef CacheLumperResponse
 * @property {number} createdAt when this was created
 * @property {object||null} data parsed data
 * @property {boolean} parsed whether the data was parsed
 * @property {string} url the url that generated this
 * @property {FakeHttpResponse} responsery to support getResponse queries when result came from cache
 * @property {FakeBlob} blobbery to recreate blobs when result came from cache
 */

/**
 * This is created to unwrap cache object
 * @typedef CacheUnLumperResponse
 * @property {boolean} cached whether item was retrieved from cache
 * @property {object||null} data parsed data
 * @property {number} age age in ms of the cached data
 * @property {Blob|| null} blob the recreated blob if there was one
 * @property {boolean} parsed whether the data was parsed
 * @property {string} url the url that provoked this entry
 * @property {FakeHttpResponse} response to support getResponse queries when result came from cache
 */

/**
 * @typedef ApplyFunctionOptions
 * @property {string} endpoint the endpoint for the api
 * @property {boolean} noCache whether to suppress cache
 * @property {Boolean} showUrl whether to display url on fetches
 */

/**
 * This is the response from the apply proxied function
 * @typedef PackResponse
 * @property {boolean} cached whether item was retrieved from cache
 * @property {object||null} data parsed data
 * @property {number} age age in ms of the cached data
 * @property {Blob|| null} blob the recreated blob if there was one
 * @property {boolean} parsed whether the data was parsed
 * @property {HttpResponse} response fetch response
 * @property {function} throw a function to throw on error
 * @property {Error || string || null} the error if there was one
 * @property {number} responseCode the http response code 
 * @property {string} url the url that provoked this response
 * @property {string} pageToken optional restart point passed back in the page paramter
 * @property {RateLimitInfo} rateLimit info about rate limit
 */

/**
 * @typedef RateLimitInfo
 * @property {number} limit the rate limit ceiling for that given endpoint
 * @property {number} remaining the number of requests left for the 15-minute window
 * @property {number} reset the remaining window before the rate limit resets in ms
 * @property {boolean} fail whether this request failed because of rate limit stuff
 * @property {number} waitFor how many ms to wait before retrying
 */


/**
 * This is used to control fetching limits
 * @typedef SuperFetchPage
 * @property {string} pageToken can be used to restart paging
 * @property {number} max number to return - items are depaged up to this number
 * @property {number} pageSize how many to get in one hit
 */

class _SuperFetch {

  /**
   * @param {SuperFetchOptions}
   * @return {_SuperFetch}
   */
  constructor({
    cacheService,
    fetcherApp,
    tokenService,
    expiry = 60 * 60 * 1,
    prefix = 'superfetch',
    rottler,
    missingPropertyIsFatal = true
  }) {
    this.cacheService = cacheService
    this.fetcher = fetcherApp
    this.tokenService = tokenService 
    this.cacher = new bmCachePoint.Cacher({ cachePoint: cacheService, expiry, prefix })
    this.rottler = rottler
    this.missingPropertyIsFatal = missingPropertyIsFatal
  }

  /**
   * this will make a wrapperfor the cache entry
   * if we have a cached result, we'll need to also partially fake a response as we can't write that
   * @param {PackResponse} pack the fetch result
   * @return {CacheLumperResponse || null} ready to be written to cache
   */
  cacheLumper(pack) {
    if (pack.error) return null

    return {
      createdAt: new Date().getTime(),
      data: pack.data,
      parsed: pack.parsed,
      url: pack.url,
      responsery: {
        responseCode: pack.response.getResponseCode(),
        headers: pack.response.getHeaders()
      },
      blobbery: pack.blob ? {
        bytes: Utilities.base64Encode(pack.blob.getBytes()),
        name: pack.blob.getName(),
        contentType: pack.blob.getContentType
      } : null
    }
  }
  /**
   * @param {} params
   * @param {function} params.informer how to add rate limit info to a pack
   * @return self
   */
  setRateLimitInformer({ informer }) {
    this.rateLimitInformer = informer
    return this
  }
  /**
   * this will unwrap a wrapperfor the cache entry
   * @param {}
   * @param {PackResponse} pack the fetch result
   * @return {CacheLumperResponse || null} ready to be written to cache
   */
  cacheUnLumper(pack, cached) {
    // pack is mutable in this function - it fiddles with it rather than spreads it
    if (!cached) {
      pack.cached = false
      return pack
    }
    const { data, blobbery, createdAt, parsed, responsery, url } = cached

    pack.cached = true
    pack.data = data ? data : null
    pack.url = url
    pack.age = new Date().getTime() - createdAt
    pack.blob = blobbery ? new Utilities.newBlob(Utilities.base64Decode(blobbery.bytes), blobbery.contentType, blobbery.name) : null
    pack.parsed = parsed
    pack.cached = Boolean(pack.cached)
    pack.responseCode = responsery && parseInt(responsery.responseCode, 10)
    // since there won't actually be a response object, we need to fake one
    pack.response = {
      getResponseCode: () => responsery && responsery.responseCode,
      getHeaders: () => responsery && responsery.headers,
      getContentText: () => pack.parsed ? JSON.stringify(pack.data) : pack.blob && pack.blob.getDataAsString(pack.blob)
    }
    return pack
  }

  /**
   * these are the args to the proxy object with some specific additions
   * @param {object} target object received from the proxy api
   * @param {object} thisArg object for this from proxy api
   * @param {ApplyFunctionOptions} params any options for the apply function generators
   * @param {...*} var_args any additional args from the proxy api - shouldnt be any for url fetch
   * @return {PackResponse} the fetch response packed
   */
  _applyAction(target, thisArg, {
    endPoint,
    noCache,
    showUrl
  } = {}, args) {
    const self = this
    // these are the standard args to urlfetch
    let [url, options = {}] = args
    url = endPoint + url
    if (showUrl) {
      console.log(url)
    }

    let { headers = {} } = options
    if (self.tokenService) headers.authorization = 'Bearer ' + 
      (typeof self.tokenService === 'function' ? self.tokenService() : self.tokenService)
    options = {
      ...options,
      headers,
      muteHttpExceptions: true,
      method: options.method || 'get'
    }

    // only allow caching on get operations
    const getting = options.method.toLowerCase() === 'get'

    // lets see if we can get it from cache
    const cached = !noCache && getting && self.cacher.get(url)

    // we'll make a data packet of the response
    const pack = {
      response: null,
      data: null,
      error: null,
      parsed: false,
      blob: null,
      age: null,
      cached: false,
      responseCode: null,
      url
    }

    // unpack the caching overhead if there is any
    self.cacheUnLumper(pack, cached)

    // if there was nothing cached, then call the api
    if (!pack.cached) {
      // we'll execute the thing and deal with the response
      pack.response = target.apply(self, [url, options])
      pack.responseCode = pack.response.getResponseCode()

      // if we're not caching always clean out the current cache
      // we won't bother removing any subsidiary records - they'lldie away anyway
      if (noCache) self.cacher.remove(url)

      // see if it was successful
      if (Math.floor((1 + pack.responseCode) / 100) === 2) {
        // attempt to parse if successful most API resposnse are JSON
        // not going to rely on the the mimeType
        try {
          pack.data = JSON.parse(pack.response.getContentText())
          // this will flag that json was successul
          pack.parsed = true

        } catch (error) {
          // so a parse error comes here - so return as a blob
          if (error.message && error.message.match("JSON")) {
            // if we didn't manage to parse it, it's not an error
            // but return the content as a blob
            pack.blob = pack.response.getBlob()
          } else {
            // some other error
            pack.error = error
          }
        }
      } else {
        // it was an http error
        pack.error = pack.response.getContentText()
      }

      // if it was successful then write the response to cache for next time
      if (!pack.error && !noCache && getting) {
        // write it to cache for next time
        self.cacher.set(url, self.cacheLumper(pack))
      }
    }

    // add a throw method shortcut
    if (self.rateLimitInformer) {
      pack.rateLimit = self.rateLimitInformer(pack)
    }
    return Utils.makeThrow(pack)
  }

  /**
   * makes a proxy to the fetcher
   */
  proxy(options = {}) {
    const self = this
    return bmDuster.proxyDust({
      originalObject: self.fetcher,
      defaultMethod: self.fetcher.fetch,
      missingPropAction: (target, prop, originalObject, receiver) => {
        if (self.missingPropertyIsFatal) {
          throw bmDuster.newUnknownPropertyError(prop)
        }
        console.log('Warning: Attempt to access non existent property in proxy', prop)
        return Reflect.get(originalObject, prop, receiver)
      },
      applyAction: (target, thisArg, ...args) => {
        if (self.rottler) self.rottler.rottle()
        return self._applyAction(target, thisArg, options, ...args)
      }
    })

  }
}
//export
var SuperFetch = _SuperFetch


