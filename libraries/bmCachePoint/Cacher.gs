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
 * @return {_Cacher}
 */
class _Cacher {
  /**
   * @param {CacherOptions}
   */
  constructor({ cachePoint = null, expiry = 60 * 60, prefix = 'bmCachePoint' }) {
    this.cachePoint = cachePoint
    this.expiry = expiry
    this.prefix = prefix
  }

  /**
   * create a key from arbitrary args
   * @param {...*} var_args
   * return {string}
   */
  digester() {
    // conver args to an array and digest them
    const t = Array.prototype.slice.call(arguments).map(function (d) {
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
    return this.digester(this.prefix, key, options)
  }

  /**
   * @return {Boolean} whether to allow item to be retrieved from cache
   */
  get cacheable () {
    return Boolean (this.cachePoint)
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
    chunk = keys.reduce((p, c) => {
      if (p) {
        const nextData = this.cachePoint.get(c)
        // if any missing cache is broken so we can invalidate
        if (!nextData) {
          console(`warning: Missing cache entry ${c} for ${digestedKey} - invalidating cache entry`)
          return null
        }
        return p += Compress.verifyKeys(digestedKey, JSON.parse(nextData)).chunk
      }
      return p
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

    // we'll give the chunks a longer expiry in case the header disappearsfloor
    children.forEach(f => this.cachePoint.put(f.key, JSON.stringify(f), expiry + 10))
    
    // write the header
    return this.cachePoint.put(digestedKey, JSON.stringify(parent), expiry)

  }
  /**
   * remove item fom cache
   * @param {string} key the key to identify the data being cached
   * @param {*} [options] any additional options to add to the key
   */
  remove(key, options) {
    if (this.cachePoint) this.cachePoint.remove(this.keyer(key,options))
  }
}
var Cacher = _Cacher

