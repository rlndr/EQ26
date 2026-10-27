/** The part of WakeLockSentinel used here, so verify.ts can supply a fake */
export interface LockSentinel {
  release(): Promise<void>
  addEventListener(type: 'release', listener: () => void): void
}

const screenLock = () =>
  typeof navigator !== 'undefined' && 'wakeLock' in navigator
    ? () => navigator.wakeLock.request('screen') as Promise<LockSentinel>
    : null

/**
 * Keeps the Screen Wake Lock held exactly while `set(true)` is in force, so the OS screensaver
 * and display sleep do not kick in over ours.
 *
 * The awkward parts are all asynchronous: the request is a promise, fullscreen can be left
 * before it resolves, and the browser drops the lock by itself whenever the tab is hidden.
 * Only one request is ever in flight; a lock that arrives after it stopped being wanted is
 * released straight away; and once the browser has dropped it, the next set(true) asks again.
 * A refusal (battery saver, permissions policy) is not retried until the next set(true).
 */
export class WakeLockKeeper {
  private want = false
  private lock: LockSentinel | null = null
  private pending = false
  private request: (() => Promise<LockSentinel>) | null

  constructor(request = screenLock()) {
    this.request = request
  }

  get held() {
    return this.lock !== null
  }

  set(want: boolean) {
    this.want = want
    this.sync()
  }

  private sync() {
    if (this.want && !this.lock && !this.pending && this.request) {
      this.pending = true
      this.request().then(
        (lock) => {
          this.pending = false
          lock.addEventListener('release', () => {
            if (this.lock === lock) this.lock = null
          })
          this.lock = lock
          // Wanted state may have changed while waiting; this releases it if so
          this.sync()
        },
        () => {
          this.pending = false
        },
      )
    } else if (!this.want && this.lock) {
      const lock = this.lock
      this.lock = null
      lock.release().catch(() => {})
    }
  }
}
