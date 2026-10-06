# Stretch: deeper modules (design first)

These go beyond the course's code. Start each one as a **design note** (use
`docs/notes/design-note-template.md`), and only then build it with your agent. A good design note
here is already a strong portfolio piece.

- **Paging and swap:** give each program its own address space mapped onto memory in pages; when
  memory is full, swap a page out. Design: the page table, a page fault as an interrupt, what the
  board shows when a page moves.
- **Caches:** a small cache between the cores and memory. Design: hit and miss on the board, what
  happens when two cores cache the same address and one writes (coherence).
- **A tiny RTOS kernel:** semaphores, a task that blocks on one, and **priority inversion** (a low
  task holds a lock a high task needs while a middle task runs). Start from a race you can see on
  your own board: three cores running the same counter handler at once end with the counter at 1,
  not 3 (each loads the same old value, adds 1, stores it back: a **lost update**). Design the fix:
  disabling interrupts around the read-modify-write, or a lock the handlers take first.
- **DMA:** a device that copies a block of memory without the CPU, then interrupts when it's done.
  Design: how it shares the bus with the cores (arbitration again), and what the board shows.
