
const Compress = (() => {

  const replacer = (key, value) => value === null ? undefined : value;
  //const stringifyDropNulls = (obj) => JSON.stringify(obj, replacer);
  // actually the replacer slows things down quite a bit so let's not do this
  const stringifyDropNulls = (obj) => JSON.stringify(obj);
  // management space for compression
  const OVERHEAD = 128;
  const MINCHUNK = 100;
  const KEYLENGTH = 36 + 4;
  const CACHEMAX = 100 * 1024

  /**
   *
   * @param {string} str b64 string to decompress
   * @return {object} original object
   */
  const decompress = (str) => {
    return JSON.parse(Utilities.unzip(Utilities.newBlob(Utilities.base64Decode(str), 'application/zip'))[0].getDataAsString())
  }

  /**
   *
   * @param {object} obj b64 to compress
   * @return {string} compressed string
   */
  const compress = (obj) => 
    Utilities.base64Encode(Utilities.zip([Utilities.newBlob(stringifyDropNulls(obj))]).getBytes())
  

  const checkSpace = (maxChunk) => {
    if (maxChunk < OVERHEAD + MINCHUNK) throw new Error(`Maxchunk ${maxChunk} should be at least ${OVERHEAD + MINCHUNK}`)
    return maxChunk - OVERHEAD
  }
  /**
   * if compressed string is too big, split into chunks
   * @param {object} obj b64 to compress
   * @param {number} [number=CACHEMAX] maxChunk
   * @return {string]} compressed string or array of chunks of strings
   */
  const compressChunks = (obj, maxChunk = CACHEMAX) => {
    // how much space we have for data
    const space = checkSpace(maxChunk)

    // first just compress it
    const t= new Date().getTime()
    let str = compress(obj)

    // need to chunk it up
    const stra = str.split('')

    // now we need to return an array of chunks
    const chunks = []
    // how many chunks will be needed 
    const needed = Math.ceil(stra.length / space)
    // the first chunk needs to be smaller to allow for keys to children
    const firstChunkLength = checkSpace(maxChunk - needed * KEYLENGTH)
    while (stra.length) chunks.push(stra.splice(0, chunks.length ? space : firstChunkLength).join(''))
    return chunks
  }

  /**
   * if compressed string is too big, split into chunks
   * @param {object} obj to compress
   * @param {number} [number] maxChunk
   * @param {string} masterKey this is stamped on children for validation
   * @return {object} {parent,children}
   */
  const keyChunks = (masterKey, obj, maxChunk) => {
    const chunks = compressChunks(obj, maxChunk)
    const keys = []

    // each child contains a chunk under the property of the masterkey
    const children = chunks.slice(1).map(chunk => {
      const key = Utilities.getUuid()
      keys.push(key)
      const ob = {
        key
      }
      ob[masterKey] = chunk
      return ob
    })
    // the parent record contains references to each of the children
    // plus the first chunk
    const parent = {
      keys
    }
    parent[masterKey] = chunks.slice(0, 1)
    return {
      children,
      parent
    }
  }


  const verifyKeys = (masterKey, ob) => {
    const chunk = ob[masterKey]
    if (!chunk) throw new Error(`expected to find property ${masterKey} in cache entry`)
    return {
      keys: ob.keys,
      chunk
    }
  }
  return {
    verifyKeys,
    decompress,
    compress,
    compressChunks,
    keyChunks
  };
})();

