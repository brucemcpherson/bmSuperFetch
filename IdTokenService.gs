
/**
 * get an id tpken as required for cloud run
 * @param {object} params
 * @param {SuperFetch} params.superFetch an instance ready to go
 * @param {string} params.audience the audience for jwt - for example the url of cloud run instance
 */
const _IdTokenService = ({
  superFetch,
  serviceAccountEmail,
  audience
}) => {

  // create an iam instance
  const iam = new Plugins.Iam({ superFetch })

  // produce id tokens object
  const idTokens = iam.tokens({
    serviceAccountEmail
  }).id({
    audience
  })

  return idTokens.service
}






