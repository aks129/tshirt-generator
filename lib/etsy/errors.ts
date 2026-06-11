export class EtsyAuthNotConnected extends Error {
  constructor() {
    super('Etsy not connected — visit /settings to connect.');
    this.name = 'EtsyAuthNotConnected';
  }
}

export class EtsyAuthExpired extends Error {
  constructor() {
    super('Etsy authorization expired — reconnect in /settings.');
    this.name = 'EtsyAuthExpired';
  }
}

export class EtsyUploadError extends Error {
  constructor(public status: number, public body: string) {
    super(`Etsy upload failed: ${status} — ${body.slice(0, 200)}`);
    this.name = 'EtsyUploadError';
  }
}
