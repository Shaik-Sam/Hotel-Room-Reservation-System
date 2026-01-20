import './style.css'

type RoomId = number

type RoomStatus = 'free' | 'booked' | 'blocked'

interface Room {
  id: RoomId
  floor: number
  indexOnFloor: number // 0-based from left (closest to stairs/lift)
  status: RoomStatus
}

interface BookingResult {
  rooms: Room[]
  totalTravelTime: number
}

// Build the fixed hotel layout
function buildHotelRooms(): Room[] {
  const rooms: Room[] = []

  // Floors 1–9, rooms xx1–xx10
  for (let floor = 1; floor <= 9; floor++) {
    for (let i = 0; i < 10; i++) {
      const roomNumber = floor * 100 + (i + 1)
      rooms.push({
        id: roomNumber,
        floor,
        indexOnFloor: i,
        status: 'free',
      })
    }
  }

  // Floor 10: 1001–1007 (7 rooms)
  const topFloor = 10
  for (let i = 0; i < 7; i++) {
    const roomNumber = 1001 + i
    rooms.push({
      id: roomNumber,
      floor: topFloor,
      indexOnFloor: i,
      status: 'free',
    })
  }

  return rooms
}

// Travel time between two specific rooms
function travelTimeBetween(a: Room, b: Room): number {
  const vertical = Math.abs(a.floor - b.floor) * 2
  const horizontal = Math.abs(a.indexOnFloor - b.indexOnFloor) * 1
  return vertical + horizontal
}

// Total travel time for a set of rooms, defined by first & last in an optimal walk
function totalTravelTimeForRooms(rooms: Room[]): number {
  if (rooms.length <= 1) return 0
  // Min over all pairs (i, j) of rooms of travelTimeBetween
  let best = Number.POSITIVE_INFINITY
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const t = travelTimeBetween(rooms[i], rooms[j])
      if (t < best) best = t
    }
  }
  return best === Number.POSITIVE_INFINITY ? 0 : best
}

// Core allocation logic following the rules
function allocateRooms(rooms: Room[], count: number): BookingResult | null {
  if (count <= 0 || count > 5) return null

  const freeRooms = rooms.filter((r) => r.status === 'free')
  if (freeRooms.length < count) return null

  // 1) Try to book entirely on a single floor
  let bestSingleFloor: BookingResult | null = null

  const roomsByFloor = new Map<number, Room[]>()
  for (const r of freeRooms) {
    if (!roomsByFloor.has(r.floor)) roomsByFloor.set(r.floor, [])
    roomsByFloor.get(r.floor)!.push(r)
  }

  for (const [floor, floorRooms] of roomsByFloor.entries()) {
    // Sort by indexOnFloor so we prefer contiguous / leftmost rooms
    const sorted = [...floorRooms].sort((a, b) => a.indexOnFloor - b.indexOnFloor)
    if (sorted.length < count) continue

    // Sliding window of size "count" on this floor
    for (let start = 0; start + count <= sorted.length; start++) {
      const candidate = sorted.slice(start, start + count)
      const time = totalTravelTimeForRooms(candidate)
      const candidateResult: BookingResult = { rooms: candidate, totalTravelTime: time }
      if (!bestSingleFloor || time < bestSingleFloor.totalTravelTime) {
        bestSingleFloor = candidateResult
      }
    }
  }

  if (bestSingleFloor) {
    return bestSingleFloor
  }

  // 2) Need to span multiple floors – choose the combination of `count` free rooms
  // that minimizes travel time between first and last room.
  // For 5 rooms max, a simple combinatorial search over free rooms is acceptable.
  const minRooms = Math.min(freeRooms.length, 20) // small optimization
  const candidatePool = [...freeRooms]
    .sort((a, b) => {
      if (a.floor !== b.floor) return a.floor - b.floor
      return a.indexOnFloor - b.indexOnFloor
    })
    .slice(0, minRooms)

  let bestMulti: BookingResult | null = null

  function backtrack(startIndex: number, chosen: Room[]) {
    if (chosen.length === count) {
      const time = totalTravelTimeForRooms(chosen)
      if (!bestMulti || time < bestMulti.totalTravelTime) {
        bestMulti = { rooms: [...chosen], totalTravelTime: time }
      }
      return
    }
    for (let i = startIndex; i < candidatePool.length; i++) {
      chosen.push(candidatePool[i])
      backtrack(i + 1, chosen)
      chosen.pop()
    }
  }

  backtrack(0, [])
  return bestMulti
}

// ---------- UI ----------

const app = document.querySelector<HTMLDivElement>('#app')!

function renderApp(state: {
  rooms: Room[]
  lastBooking: BookingResult | null
  message: string | null
}) {
  const { rooms, lastBooking, message } = state
  const bookedIds = new Set(lastBooking?.rooms.map((r) => r.id) ?? [])

  const floors = Array.from(
    rooms.reduce((map, room) => {
      if (!map.has(room.floor)) map.set(room.floor, [])
      map.get(room.floor)!.push(room)
      return map
    }, new Map<number, Room[]>())
  ).sort((a, b) => b[0] - a[0]) // show top floor first

  app.innerHTML = `
    <div class="page">
      <header class="header">
        <div>
          <h1>Hotel Room Reservation System</h1>
          <p class="subtitle">97 rooms · 10 floors · Optimal grouping by travel time</p>
        </div>
        <div class="stats">
          <span><strong>Total rooms:</strong> 97</span>
          <span><strong>Free:</strong> ${rooms.filter((r) => r.status === 'free').length}</span>
          <span><strong>Booked:</strong> ${rooms.filter((r) => r.status === 'booked').length}</span>
        </div>
      </header>

      <section class="controls">
        <div class="controls-left">
          <label class="field">
            <span>Rooms to book (1–5)</span>
            <input id="room-count" type="number" min="1" max="5" value="1" />
          </label>
          <button id="book-btn" class="primary">Book rooms</button>
        </div>
        <div class="controls-right">
          <button id="random-btn" class="ghost">Random occupancy</button>
          <button id="reset-btn" class="danger">Reset hotel</button>
        </div>
      </section>

      <section class="feedback">
        ${
          message
            ? `<div class="message">${message}</div>`
            : lastBooking
              ? `<div class="message success">
                  Booked ${lastBooking.rooms.length} rooms.
                  Total travel time between furthest rooms: <strong>${
                    lastBooking.totalTravelTime
                  } minutes</strong>.
                </div>`
              : `<div class="message muted">No booking yet. Choose number of rooms and click "Book rooms".</div>`
        }
      </section>

      <section class="hotel-view">
        <h2>Hotel layout</h2>
        <div class="legend">
          <span class="legend-item"><span class="room-chip free"></span> Free</span>
          <span class="legend-item"><span class="room-chip booked"></span> Booked</span>
          <span class="legend-item"><span class="room-chip selected"></span> This booking</span>
        </div>
        <div class="floors">
          ${floors
            .map(([floor, floorRooms]) => {
              const sorted = floorRooms.sort((a, b) => a.indexOnFloor - b.indexOnFloor)
              return `
                <div class="floor-row">
                  <div class="floor-label">Floor ${floor}</div>
                  <div class="rooms-row">
                    <div class="stairs">◀ stairs / lift</div>
                    ${sorted
                      .map((room) => {
                        const classes = ['room']
                        if (room.status === 'free') classes.push('free')
                        if (room.status === 'booked') classes.push('booked')
                        if (bookedIds.has(room.id)) classes.push('selected')
                        return `<div class="${classes.join(' ')}">${room.id}</div>`
                      })
                      .join('')}
                  </div>
                </div>
              `
            })
            .join('')}
        </div>
      </section>
    </div>
  `

  // Wire events
  const bookBtn = document.querySelector<HTMLButtonElement>('#book-btn')!
  const randomBtn = document.querySelector<HTMLButtonElement>('#random-btn')!
  const resetBtn = document.querySelector<HTMLButtonElement>('#reset-btn')!
  const roomCountInput = document.querySelector<HTMLInputElement>('#room-count')!

  bookBtn.onclick = () => {
    const value = parseInt(roomCountInput.value, 10)
    if (isNaN(value) || value < 1 || value > 5) {
      renderApp({
        rooms,
        lastBooking: null,
        message: 'Please enter a valid room count between 1 and 5.',
      })
      return
    }
    const result = allocateRooms(rooms, value)
    if (!result) {
      renderApp({
        rooms,
        lastBooking: null,
        message: 'Unable to allocate the requested number of rooms with current availability.',
      })
      return
    }
    const newRooms = rooms.map((r) =>
      result.rooms.some((br) => br.id === r.id) ? { ...r, status: 'booked' } : r
    )
    renderApp({
      rooms: newRooms,
      lastBooking: result,
      message: null,
    })
  }

  randomBtn.onclick = () => {
    // Randomly mark some rooms as booked, keeping others free
    const newRooms = rooms.map((r) => {
      // Around 30–60% occupancy
      const shouldBook = Math.random() < 0.45
      return {
        ...r,
        status: shouldBook ? 'booked' : 'free',
      }
    })
    renderApp({
      rooms: newRooms,
      lastBooking: null,
      message: 'Random occupancy applied.',
    })
  }

  resetBtn.onclick = () => {
    renderApp({
      rooms: buildHotelRooms(),
      lastBooking: null,
      message: 'Hotel has been reset to all rooms free.',
    })
  }
}

// Initial render
renderApp({
  rooms: buildHotelRooms(),
  lastBooking: null,
  message: null,
})
