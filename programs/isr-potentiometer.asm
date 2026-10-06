; Potentiometer interrupt handler: runs once each time the knob settles on a new value.
; Symbols filled in by the host from the slot's wiring:
;   COUNTER   this slot's counter byte (0x3E0 + slot): times the knob settled
;   REGISTER  this slot's device register (0x3F0 + slot): the settled value, 0 to 255
; To drive an LED from the knob, add `LOAD R2, REGISTER` and `STORE R2, <the LED's register>`
; before IRET. The LED is on when the knob is past halfway (128).

        ; @student week=stretch part=home id=isr-potentiometer "Count the settle: add 1 to COUNTER, then return from the interrupt"
        ; TODO(stretch, isr-potentiometer): Count the settle: add 1 to COUNTER, then return from the interrupt
        IRET
        ; @end
