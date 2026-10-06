; Temperature sensor interrupt handler: runs when the reading crosses the threshold going up.
; The host loads it at the sensor's slot and fills in the symbols from the slot's wiring:
;   COUNTER   this slot's counter byte (0x3E0 + slot): number of alarms so far
;   REGISTER  this slot's device register (0x3F0 + slot): the reading that caused the alarm
; IRET puts every register back, so using R0 and R1 here is safe.

        ; @student week=stretch part=home id=isr-sensor "Count the alarm: add 1 to COUNTER, then return from the interrupt"
        ; TODO(stretch, isr-sensor): Count the alarm: add 1 to COUNTER, then return from the interrupt
        IRET
        ; @end
