; Proximity sensor interrupt handler: runs when something comes inside the radius.
; Symbols filled in by the host from the slot's wiring:
;   COUNTER   this slot's counter byte (0x3E0 + slot): times something came near
;   REGISTER  this slot's device register (0x3F0 + slot): distance, 0 (touching) to 255 (far)
; A program can watch COUNTER change to react to a visitor, and LOAD REGISTER for how close.

        ; @student week=stretch part=home id=isr-proximity "Count the visit: add 1 to COUNTER, then return from the interrupt"
        ; TODO(stretch, isr-proximity): Count the visit: add 1 to COUNTER, then return from the interrupt
        IRET
        ; @end
