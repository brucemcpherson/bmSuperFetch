
/**
 * @typedef IamApiOptions
 * @property {_SuperFetch} superFetch a superfetch instance
 * @property {boolean} noCache whether to cache
 * @property {boolean} showUrl whether to showUrls when fetching
 * @property {object[]} extraParams always add these params
 */
class _IamApi {
  /** 
   * for creating oauth token (eg idtoken for cloud run)
   * https://cloud.google.com/iam/docs/reference/credentials/rest
   * @param {IamApiOptions} 
   * @return {_IamApi}
   */
  constructor({
    superFetch,
    // caching can be used here if you don't want to keep calling the iam service for each call
    // but of course they do expire
    noCache = true,
    showUrl,
    extraParams = [],
    base = ''
  }) {
    this.noCache = noCache
    this.showUrl = showUrl
    this.extraParams = Utils.arrify(extraParams)
    this.base = base
    this.superFetch = superFetch
    this.credentialsProxy = superFetch.proxy({
      endPoint: `https://iamcredentials.googleapis.com/v1`,
      noCache,
      showUrl
    })
  }
  /**
   * create a new ref - which is just another instance of the class with a different base
   * @param {string} base a new base 
   * @param {IamApiOptions}
   * @return {_IamApi}
   */
  // create a new ref - which is just another instance of the class with a different base
  ref(base = '', {
    superFetch = this.superFetch,
    noCache = this.noCache,
    showUrl = this.showUrl,
    extraParams = this.extraParams
  } = {}) {
    return new _IamApi({
      superFetch,
      noCache,
      showUrl,
      extraParams,
      base: Utils.singleSlash(this.base + (base ? '/' + base : ''))
    })
  }
  /**
   * tokens domain
   * @param {object} params
   * @param {string} params.serviceAccountEmail the service account to get token for
   * @return {object} containing the functions available in the tokens domain
   */
  tokens({ serviceAccountEmail }) {
    const self = this
    const tokens = {
      /**
       * tokens.id domain
       * @param {object} params
       * @param {string} params.serviceAccountEmail the service account to get token for
       * @param {string} [params.audience] the audience for jwt - for example the url of cloud run instance
      */
      id: ({ audience, delegates }) => {
        const id = {
          /**
           * the returned funcion can be passed to superfetch
           * @return {function} a function that can generate an jwt id token
          */
          service() {
            return id.fullService().throw().data.token
          },
          /**
           * @return {string} an jwt id token
          */
          get token() {
            return id.service()
          },
          fullService() {
            const body = {
              audience
            }
            if (delegates) body.delegates = delegates
            const options = {
              method: "POST",
              contentType: "application/json",
              payload: JSON.stringify(body)
            }
            return self.credentialsProxy(self.makeTokenServicePath({
              serviceAccountEmail,
              type: 'generateIdToken'
            }), options)

          }
        }
        return id
      }
    }
    return tokens
  }
  /**
   * make path to access credential generator
   * @param {object} params
   * @param {string} params.serviceAccountEmail the service account to get token for
   * @param {string} params.type of credential generateIdToken | generateAuthToken
   * @return {string} relative path
   */
  makeTokenServicePath({
    serviceAccountEmail,
    type
  }) {
    return Utils.makeUrl({
      url: `/projects/-/serviceAccounts/${serviceAccountEmail}:${type}`,
      params: this.extraParams,
      skipSub: true
    })
  }

}

