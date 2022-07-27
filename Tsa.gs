
/**
 * @typedef TsaOptions
 * @property {_SuperFetch} superFetch a superfetch instance
 * @property {boolean} noCache whether to cache
 * @property {boolean} showUrl whether to showUrls when fetching
 * @property {object[]} extraParams always add these params
 */
class _TsaApi {
  /**
   * @param {TsaOptions} 
   * @return {_TsaApi}
   */
  constructor({
    superFetch,
    // caching can be used here if you don't want to keep calling the iam service for each call
    // but of course they do expire
    noCache = false,
    showUrl,
    extraParams = []
  }) {
    this.extraParams = Utils.arrify(extraParams)
    this.proxy = superFetch.proxy({
      endPoint: `https://tsapi-demo.azurewebsites.net`,
      noCache,
      showUrl
    })
  }

  get surveys() {
    const base = "/Surveys"
    return {
      list: (...params) => {
        return this.proxy(this.makePath({ path: Utils.makepath({ base }), params }))
      },
      get: ({ id }, ...params) => {
        return this.proxy(this.makePath({
          path: Utils.makepath({ path: ':id/MetaData', base }),
          params: params.concat([{ id }])
        }))
      },
      download: ({ id }, ...params) => {
        const payload = params.reduce((p, c) => {
          return {
            ...p,
            ...c
          }
        }, { surveyId: id })

        return this.proxy(
          this.makePath({ path: Utils.makepath({ path: '/Interviews', base }), params }), {
          method: "POST",
          payload: JSON.stringify(payload),
          contentType: 'application/json'
        })
      }
    }
  }

  makePath({ path = '', params }) {
    return Utils.makeUrl({
      url: Utils.makepath({ path, base: '' }),
      params: params.concat(this.extraParams)
    })
  }

}

var TsaApi = _TsaApi


