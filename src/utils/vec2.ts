export interface Vec2 { x: number; y: number }

export const vec2  = (x: number, y: number): Vec2 => ({ x, y })
export const add   = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y })
export const sub   = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y })
export const scale = (v: Vec2, s: number): Vec2 => ({ x: v.x * s, y: v.y * s })
export const vfloor = (v: Vec2): Vec2 => ({ x: Math.floor(v.x), y: Math.floor(v.y) })
export const len   = (v: Vec2): number => Math.sqrt(v.x * v.x + v.y * v.y)
