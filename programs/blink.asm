; Blink the LED four times, then stop.
.equ LED 0x3F1              ; the demo puts the LED in slot 1

        LOADI R2, 4         ; blinks left
        LOADI R3, 1
again:  LOADI R0, 255
        STORE R0, LED       ; on (the LED is on when its register is >= 128)
        LOADI R0, 0
        STORE R0, LED       ; off
        SUB   R2, R3
        JNZ   again
        HALT
