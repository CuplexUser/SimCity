type Handler<T> = (payload: T) => void

class EventBus {
  private handlers = new Map<string, Set<Handler<unknown>>>()

  on<T>(event: string, handler: Handler<T>): () => void {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set())
    const set = this.handlers.get(event)!
    set.add(handler as Handler<unknown>)
    return () => set.delete(handler as Handler<unknown>)
  }

  emit<T>(event: string, payload: T): void {
    this.handlers.get(event)?.forEach(h => h(payload))
  }
}

export const events = new EventBus()

// Typed event payloads
export interface TickEvent  { tick: number }
export interface YearEvent  { year: number; revenue: number; expenses: number }
export interface TileEvent  { col: number;  row: number }
