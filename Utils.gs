const Utils = (() => {

  const makeThrow = (pack) => {

    // add a throw method shortcut
    pack.throw = pack.error
      ? () => {
        throw new Error(pack.error)
      }
      : () => pack

    return pack

  }

  return {
    makeThrow
  }

})()

