class _Tanking {
  /**
   * tank style paging
   * 
   */


  constructor({ context }) {

    this.context = context

    // does repeated fetches
    this.inTank = new _Tank({
      name: 'page-tanking-in',
      context,

      // deal with this 1 at a time
      capacity: context.maxChunk,

      // this will get called each time to get the next page
      filler: (tank) => {

        const { context } = tank
        const { page, tokenFinder } = context
        // fix up pageSize needed
        page.max = page.max || Infinity
        page.pageSize = Math.min(page.pageSize || page.max, context.maxChunk, page.max - tank.in)

        // ends when we've got all that was asked for, or there's no pagetoken and its not the initial pull
        if (tank.in >= page.max || (tank.in && !page.pageToken)) {
          return {
            items: null
          }
        }


        // do a get
        const result = context.getter({ page })

        // the last known result will be stored as the final one
        context.result = result

        // get pageToken for next up
        page.pageToken = tokenFinder(result)

        // extract the items and return
        const tankResult = {
          error: context.result.error,
          items: context.extractor(result.data)
        }
        // we don't need the data part any more, except for the page token
        context.result.data = null

        // but they may want this
        context.result.pageToken = page.pageToken
        // except for the page token
        return tankResult
      }
    })


    // does the output
    this.outTank = new _Tank({
      name: 'page-tanking-out',
      context,
      capacity: 200,
      emptier: (tank, items) => {
        tank.context.items = tank.context.items.concat(items)
      }
    })

    // sets the finalizer
    this.outTank.on("stream-end", context.finalizer || (({ tank }) => tank))

  }

  start() {
    return this.inTank.pipe(this.outTank)
  }

}

