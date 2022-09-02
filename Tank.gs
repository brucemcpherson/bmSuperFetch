
/**
 * @typedef TankReadings
 * @property {string} name the tank name given at the construction
 * @property {number} createdAt	the time the instance was created
 * @property {number} capacity the number of items the tank can hold
 * @property {number} timeStamp when the event was emitted
 * @property {string}	eventName	the name of the event
 * @property {number} creationOffset how many ms since the item was created
 * @property {number} the current level of the tank content
 * @property {number}	in total number of items ever input to the tank
 * @property {number}	out	total number of items ever output from the tank
 * @property {number}	transformed	total number of items after transformation
 * @property {number} itemsFilled	how many items were received at the last fill up
 * @property {number} itemsEmptied how many items were emptied by the last emptier
 * @property {number} itemsTransformed how many items were created at last transformation
 * @property {boolean} isDone	the input is exhausted
 * @property {*} error any error preventing the tank from operating
 */
/**
 * @typedef TankPack
 * @property {*[]} items the array of items to operate on
 * @property {*} error any error that happened
 */
/**
 * @typeDef TankOptions
 * @property {function} filler function to fill a tank
 * @property {function} emptier function to empty a tnk
 * @property {function} transformer function to transform a tank
 * @property {string} name the tank name (used for event reporting)
 */
class _Tank {

  // handy transformers you can us
  static get transformers() {
    return {
      toBytes: (tank, items) => {
        return {
          items: Utils.toBytes(items)
        }
      }
    }

  }
  /**
   * @param {TankOptions} params
   * @retutn {_Tank}
   */
  constructor({ filler, emptier, transformer, capacity, name = 'tank' }) {
    this.filler = filler
    this.capacity = capacity
    this.emptier = emptier
    this.transformer = transformer
    this.pen = []
    this._in = 0
    this._out = 0
    this._transformed = 0
    this.createdAt = new Date().getTime()
    this._error = null
    this._done = false
    this._itemsFilled = 0
    this._itemsEmptied = 0
    this._itemsTransformed = 0
    this._inTank = null
    this._outTank = null
    this.name = name
    this.id = Utils.uuid()

    this.events = [
      'data',
      'filler-start',
      'filler-end',
      'emptier-start',
      'emptier-end',
      'transformer-start',
      'transformer-end',
      'done',
      'empty',
      'full',
      'error',
      'level',
      'pipe-done',
      'stream-end',
      'before-stream-end'
    ].reduce((p, c) => {
      p[c] = null
      return p
    }, {})
    
    if (!this.capacity) throw 'capacity must be > 0'
    const fc = ['filler', 'emptier'].reduce((p, c) => p + (this[c] ? 1 : 0), 0)
    if (fc > 1) throw 'a tank can have a filler or an emptier but not both'
  }

  /**
   * make a new tank based on the old
   * @param {TankOptions} params
   * @retutn {_Tank}
   */
  ref({
    filler = this.filler,
    emptier = this.emptier,
    transformer = this.transformer,
    capacity = this.capacity,
    name = this.name
  } = {}) {
    return new _Tank({ filler, emptier, transformer, capacity, name })
  }
  /**
   * check if this tank has an error - if it has it cant run
   */
  checkError() {
    if (this.error) {
      console.log(this.error)
      this.thrower(`Can't continue after an error`)
    }
  }

  /**
   * get the number of items that were added to the input tank at the last fill operation
   * @return {number}
   */
  get itemsFilled() {
    return this._itemsFilled
  }

  /**
   * set the number of items that were added to the tank at the last fill operation
   * @param {number} value the number of items
   */
  set itemsFilled(value) {
    this._itemsFilled = value
  }

  /**
   * gets the number of items that were added in total
   * @return {number}
   */
  get in() {
    return this._in
  }

  /**
   * set the number of items that were added in total
   * @param {number} value the number of items
   */
  set in(value) {
    this._in = value
    if (value) this.emit('level')
  }

  /**
   * gets the number of items that were added in total
   * @return {number}
   */
  get out() {
    return this._out
  }

  /**
   * set the number of items that were added in total
   * @param {number} value the number of items
   */
  set out(value) {
    this._out = value
    if (value) this.emit('level')
  }

  /**
   * gets the number of items that were transformed in total
   * @return {number}
   */
  get transformed() {
    return this._transformed
  }

  /**
   * set the number of items that were added in total
   * @param {number} value the number of items
   */
  set transformed(value) {
    this._transformed = value
  }

  /**
   * get the number of items that were removed from the tank at the last empty operation
   * @return {number}
   */
  get itemsEmptied() {
    return this._itemsEmptied
  }

  /**
   * set the number of items that were removed from the tank at the last empty operation
   * @param {number} value the number of items removed
   */
  set itemsEmptied(value) {
    this._itemsEmptied = value
  }

  /**
   * get the number of output items after a transformation
   * @return {number}
   */
  get itemsTransformed() {
    return this._itemsTransformed
  }

  /**
   * set the number of output items after a transformation
   * @param {number} value the number of items after a transformation
   */
  set itemsTransformed(value) {
    this._itemsTransformed = value
  }
  /**
   * get the pipe thats sending me data
   * @return {boolean} whether done
   */
  get inTank() {
    return this._inTank
  }

  /**
   * set the pipe thats sending me data
   * @param {boolean} value whether done
   */
  set inTank(value) {
    this._inTank = value
  }
  /**
   * get the pipe thats im sending data to
   * @return {boolean} whether done
   */
  get outTank() {
    return this._outTank
  }

  /**
   * set the pipe thats im sending data to
   * @param {boolean} value whether done
   */
  set outTank(value) {
    this._outTank = value
  }
  /**
   * get whether the filling operations are complete
   * @return {boolean} whether done
   */
  get done() {
    return this._done
  }

  /**
   * set whether the filling operations are complete
   * @param {boolean} value whether done
   */
  set done(value) {
    this._done = value
    if (value) this.emit('done')
  }

  /**
   * get the error status of the tank
   * @return {*} the error
   */
  get error() {
    return this._error
  }

  /**
   * set the error status of the tank
   * @param {*} value the error
   */
  set error(value) {
    this._error = value
    this.emit('error')
  }

  /**
   * record an error and throw an error
   * @param {*} message the error
   */
  thrower(message) {
    this.error = message
    throw this.error
  }

  /**
   * record an error and throw an error
   * @param {function} action check something is a function
   */
  checkFunc(action) {
    if (typeof action !== 'function') this.thrower('expected a function for event action')
  }

  /**
   * check whether an event exists
   * @param {string} eventName check an eventname is valid
   */
  checkEvent(eventName) {
    if (!Reflect.has(this.events, eventName)) {
      this.thrower(`event ${eventName} must be one of ${this.events.join(",")}`)
    }
  }

  /**
   * add the same action function to each of the given names
   * @param {string | string[]} eventNames turn on event tracking of given names
   * @param {function} action the callback
   * @param {*} context anything that will be passed back on event emit
   * @return {_Tank} self
   */
  on(eventNames, action, context) {
    this.checkFunc(action)
    Utils.arrify(eventNames).forEach(eventName => {
      this.checkEvent(eventName)
      this.events[eventName] = {
        action,
        context
      }
    })
    return this
  }

  /**
   * @param {string | string[]} eventNames turn off event tracking of given names
   * @return {_Tank} self
   */
  off(eventNames) {
    Utils.arrify(eventNames).forEach(eventName => {
      this.checkEvent(eventName)
      this.events[eventName] = null
    })
    return this
  }

  /**
   * @param {string} eventName create a reading object for the given eventname
   * @return {TankReadings} the readings
   */
  _readings(eventName) {
    const timeStamp = new Date().getTime()
    return [
      'level',
      'in',
      'out',
      'transformed',
      'itemsFilled',
      'itemsEmptied',
      'itemsTransformed',
      'isDone',
      'error'
    ].reduce((p, c) => {
      p[c] = this[c]
      return p
    }, {

      name: this.name,
      createdAt: this.createdAt,
      capacity: this.capacity,
      timeStamp,
      eventName,
      creationOffset: timeStamp - this.createdAt
    })
  }

  isActionable(eventName) {
    return this.events[eventName]
  }

  /**
   * signal an event for the given event
   * @param {string} eventName event to signal
   * @return {_Tank} self
   */
  emit(eventName) {
    if (this.isActionable(eventName)) {
      const { action, context } = this.events[eventName]
      const readings = this._readings(eventName)
      action({
        readings,
        tank: this,
        context
      })
    }
    return this
  }

  /**
   * add the gven items to a 
   * @param {* | *[]} [items=[]] the items to add
   * @return {_Tank} self
   */
  add(items = []) {
    this.checkError()
    items = Utils.arrify(items)

    if (items.length) {
      const result = this.execTransformer({
        items
      })
      if (result.error) {
        this.error = result.error
      }
       items = result.items
    }

    if (items.length) {
      this.pen = this.pen.concat(items)
      this.in += items.length
      this.emit('data')
      if (this.isFull) this.emit('full')
    } else {
      console.log('attempt to add 0 items', this.level, this.name)
    }
    return this
  }

  /**
   * fill the tank to the top
   * @return {_Tank} self
   */
  fill() {
    // if we're in an error state refuse
    this.checkError()

    // for as long as we're not full get more
    while (!this.error && !this.isFull && !this.isDone) {
      // use the filler to pick up next batch
      this.execFiller()
    }
    return this
  }

  /**
   * how much is currently in the tank
   * @return {number} number of items in the tank
   */
  get level() {
    return this.pen.length
  }

  /**
   * is the tank currently empty
   * @return {Boolean}
   */
  get isEmpty() {
    return !this.level
  }

  /**
   * is the input finished
   * @return {Boolean}
   */
  get isDone() {
    return this.done
  }

  /**
   * is the tank currently full or (overfull)
   * @return {Boolean}
   */
  get isFull() {
    return this.level >= this.capacity
  }

  /**
   * remove items from the tank
   * @param {number} size how many items to remove
   * @return {*[]} the removed items
   */
  remove(size) {
    if (!size) this.thrower('unexpected attempt to remove 0 items')
    const items = this.pen.splice(0, size)
    if (this.isEmpty) this.emit('empty')
    this.out += items.length
    return items
  }

  _fillerWork () {

    this.itemsFilled = 0

    this.emit('filler-start')
    let result = this.filler(this)
    this.itemsFilled = result.items && result.items.length

    if (result.error) {
      this.error = result.error
    }
    this.emit('filler-end')
    return result
  }
  /**
   * execute the filler function
   * @return {TankPack} what came back from the filler
   */
  execFiller() {

    // do a fill
    const result = this._fillerWork()

    // a null or undefined items signals input is exhausted
    // otherwise we add the items to pen
    if (!result.items) {
      this.done = true
    } else if (!this.error) {
      this.add(result.items)
    }
    return result
  }

  /**
   * execute the emptier function
   * @param {*[]} the items to empty 
   * @return {TankPack} what came back from the emptier
   */
  execEmptier(items) {
    this.itemsEmptied = 0
    this.emit('emptier-start')
    const result = this.emptier(this, items)
    this.itemsEmptied = items && items.length

    this.emit('emptier-end')
    if (result && result.error) {
      this.error = result.error
    }
    return result
  }

  /**
   * execute the transform function
   * @param {TankPack} pack what came back from the filler
   * @return {TankPack} pack after transformation
   */
  execTransformer(pack) {
    // need to transform
    if (!this.transformer) {
      this.itemsTransformed = 0
      return pack
    }
    this.emit('transformer-start')
    const result = this.transformer(this, pack.items)
    this.itemsTransformed = (result && result.items && result.items.length) || 0
    this.emit('transformer-end')
    if (result && result.error) {
      this.error = result.error
    }
    this.transformed += this.itemsTransformed
    return result
  }

  /**
   * empty the tank
   * @return {_Tank} self
   */
  empty() {
    // if we're in an error state refuse
    this.checkError()

    // for as long as the tank isn't empty, keep emotying it
    while (!this.error && !this.isEmpty) {
      // write them away
      this.execEmptier(this.remove(this.capacity))
    }
    return this
  }


  get _startPipe() {
    let start = this
    while (start.inTank) start = start.inTank
    return start
  }

  /**
   * turn the pipeline into an array of tanks
   * @return {_Tank[]} pipeline
   */
  get _pipeline() {
    const pipeline = []
    let p = this._startPipe
    while (p) {
      pipeline.push(p)
      p = p.outTank
    }
    return pipeline
  }

  _checkClean() {
    const pipeline = this._pipeline
    // check we don't have the same tank multiple times
    if (pipeline.filter((f, i, a) => a.findIndex(g => g.id === f.id) === i).length !== pipeline.length) {
      throw 'Duplicate tank found in pipeline'
    }
    pipeline.forEach(tank => {
      tank.checkError()
      if (tank.level || tank.isDone) {
        throw `${tank.name} has already participated in a pipe - you can use .ref() to make a new instance`
      }
    })
    return this
  }
  /**
   * here;s how this works
   * called in a chain source.pipe(b).pipe(c)....pipe(target)
   * source must have a filler - to get chunks of data from some source
   * target must have an emptier to put chunks of data to some target
   * the pipe operation begins when an emptier is detected in the out tank
   * each tank can have one of
   * - a filler (the first one only) 
   * - a transformer (if no transformer a default pass thru is created)
   * - an emptier (the last one only)
   * each tank have different capacities - the data will be piped to the next tank process when it is full
   * @param {_Tank} out add this to the pipe chain
   * @return {_Tank} out
   */
  pipe(out) {
    // if we're in an error state refuse
    this.checkError()
    // avoid any 'this' problems
    const self = this

    // get the start point of this piping
    const start = self._startPipe

    if (!start.filler || out.filler) {
      throw `The first tank ${self.name} must contain a filler function`
    }

    if (out.filler) {
      throw `Only first tank ${start.name} must contain a filler function - found another in ${out.name}`
    }

    const te = self._pipeline.find(p => p.emptier)
    if (te) {
      throw `Only the final tank can have an emptier - found another in ${te.name}`
    }

    // we can start working if we have an emptier
    // set the filler of out 
    out.inTank = self
    self.outTank = out
    self._checkClean()

    // recursive to deal with piping
    const pipette = (tank) => {

      // this is the feeder tank for here
      const { inTank, outTank } = tank
      const mover = () => {
        while (!inTank.isEmpty && !inTank.error && !tank.isFull) {
          tank.add(inTank.remove(tank.capacity, true))
        }
      }

      while (!inTank.isEmpty && !inTank.error && !tank.error) {
        // move stuff along
        mover()
        // go to next in chain
        if (outTank) {
          pipette(outTank)
        }
        while (tank.isFull && tank.emptier && !tank.error) {
          tank.empty()
        }
      }

    }


    // that's the end of the pipe (because it has an emptier - we can start piping)
    if (out.emptier) {

      // recurse through the pipeline
      while (!start.isDone && !start.error) {
        if (start.isEmpty) start.fill()
        pipette(start.outTank)
      }

      // now just clear out the final pipe
      out.emit('before-stream-end')

      out.empty()

      // signal it's all over for each member of the pipeline
      out._pipeline.forEach(tank => tank.emit('pipe-done'))
      out.emit('stream-end')

    }
    return Utils.makeThrow(out)
  }



}

