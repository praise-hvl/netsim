; Default interrupt handler: count how many times this peripheral has interrupted.
; The host fills in COUNTER (and VECTOR, REGISTER) from the peripheral's slot.
        LOAD  R0, COUNTER
        LOADI R1, 1
        ADD   R0, R1
        STORE R0, COUNTER
        IRET
