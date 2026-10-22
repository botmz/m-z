type PendingSecret = {
  resolve: (value: string) => void;
  reject: (reason: Error) => void;
};

/** Holds no submitted value; it only waits for one in-memory answer. */
export class OneTimeSecretGate {
  private pending: PendingSecret | undefined;

  get isWaiting() { return this.pending !== undefined; }

  wait(): Promise<string> {
    if (this.pending) return Promise.reject(new Error("A verification response is already pending"));
    return new Promise((resolve, reject) => { this.pending = { resolve, reject }; });
  }

  submit(value: string): boolean {
    const pending = this.pending;
    if (!pending) return false;
    this.pending = undefined;
    pending.resolve(value);
    return true;
  }

  cancel(reason = "Verification request expired"): void {
    const pending = this.pending;
    if (!pending) return;
    this.pending = undefined;
    pending.reject(new Error(reason));
  }
}
