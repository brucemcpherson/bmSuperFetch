/**
 * uses apps script caching
 * will compresss all data
 * if necessary will spill over multiple cache entries
 */

/**
 * typedef CacherOptions
 * @property {CacheService} [cachePoint=null] the cacheservice to use - if null no cachng will be done, but all methods will still work
 * @property {number} [expiry = 60*60] default expiry in seconds
 * @property  {string} [prefix='bmCachePoint] can be used to change key generation algo to partition cache entries
 * @property {boolean} stale whether to use stale cache processing
 * @property {string} staleKey key to use to get stale value
 * @return {_Cacher}
 */
class _Cacher {
  /**
   * @param {CacherOptions}
   */
  constructor({ cachePoint = null, expiry = 60 * 60, prefix = 'bmCachePoint' , staleKey = 'stale' , stale = false}) {
    this.cachePoint = cachePoint
    this.expiry = expiry
    this.prefix = prefix
    this.staleKey = staleKey
    this.stale = stale
    if (this.stale && !this.staleKey) throw `Must specify a staleKey if stale is active`
  }

  /**
   * create a key from arbitrary args
   * @param {...*} var_args
   * return {string}
   */
  digester(...args) {
    // conver args to an array and digest them
    const t = args.map(function (d) {
      if(typeof d === typeof undefined) throw new Error('digester key component cant be undefined')
      return (Object(d) === d) ? JSON.stringify(d) : d.toString();
    }).join("-")
    const s = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_1, t, Utilities.Charset.UTF_8)
    return Utilities.base64EncodeWebSafe(s)
  }

  /**
   * make a digest to key on
   * @param {string} key the key to identify the data being cached
   * @param {*} [options=''] any additional options to add to the key
   * @return {string} the key
   */ 
  keyer(key, options = '') {
    return this.digester(this.staleValue() ,this.prefix, key, options)
  }

  /**
   * @return {Boolean} whether to allow item to be retrieved from cache
   */
  get cacheable () {
    return Boolean (this.cachePoint)
  }

  get staler () {
    return this.staleKey + '_' + this.prefix
  }
  /** 
   * if there's a stalekey its value will be added to the prefix
   * @return {string}
   * */ 
  staleValue () {
    return (this.stale && this.cachePoint.get(this.staler)) || ''
  }

  /**
   * update stale value
   */
  makeStale () {
    if(!this.stale) return null
    const staleValue = Utilities.getUuid()
    this.cachePoint.put (this.staler, staleValue, this.expiry + 30)
  }

  /**
   * get item fom cache
   * @param {string} key the key to identify the data being cached 
   * @param {*} [options] any additional options to add to the key
   * @return {string || null} value from cache
   */
  get(key, options ) {
    // we can't cache this
    if (!this.cacheable) return null

    // create a key from the request uniqueness
    const digestedKey = this.keyer(key, options)

    // get it from cache if we can
    const data = this.cachePoint.get(digestedKey)
    if (!data) return null

    // now we need to establish whether this was spread over several cache entries and dechunk it
    let {
      keys,
      chunk
    } = Compress.verifyKeys(digestedKey, JSON.parse(data))

    // if we have some children
    const bits = keys.length ? this.cachePoint.getAll(keys) : {}

    chunk = keys.reduce((p, c) => {
      const bit = bits[c]
      if (!bit) {
        console.log(`warning: Missing cache entry ${c} for ${digestedKey} - invalidating cache entry`)
        return null
      }
      return p ?  p += Compress.verifyKeys(digestedKey, JSON.parse(bit)).chunk : null
    }, chunk)

    // finally decompress
    return Compress.decompress(chunk)
  }

  /**
   * set item to cache
   * @param {string} key the key to identify the data being cached 
   * @param {string} data
   * @param {object} [params] 
   * @param {*} [params.options] any extra stuff to add to the key key
   * @param {expiry} [params.expiry] expiry in seconds to override the default cacher settings
   * @return {string || null} value from cache
   */
  set(key, data, {
    options,
    expiry = this.expiry
  } = {}) {
    // we can't cache this
    if (!this.cacheable) return null

    // create a key from the request uniqueness
    const digestedKey = this.keyer(key, options)

    // if there's no data to write, clear previous occupant
    if (!data) {
      this.cachePoint.remove(digestedKey)
      return null
    }

    // compress the data
    const { parent, children } = Compress.keyChunks(digestedKey, data)

    // put them all at once
    if (children.length) {
      const bits = children.reduce((p,c) => {
        p[c.key] = JSON.stringify(c)
        return p
      } , {}) 
      // we'll give the children a longer expiry in case the header disappears first
      const t = new Date().getTime()
      this.cachePoint.putAll(bits, expiry + 10)
    }
    // write the header
    return this.cachePoint.put(digestedKey, JSON.stringify(parent), expiry)

  }
  /**
   * remove item fom cache
   * @param {string} key the key to identify the data being cached
   * @param {*} [options] any additional options to add to the key
   */
  remove(key, options) {
    if (this.cachePoint) {
      const digestedKey = this.keyer(key,options)
      this.cachePoint.remove(digestedKey)
    }
  }
}
var Cacher = _Cacher

