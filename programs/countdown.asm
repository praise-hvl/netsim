; Count down from 9 to 0 on the seven-segment display, then stop.
.equ DISPLAY 0x3F2          ; the demo puts the seven-segment display in slot 2

        LOADI R0, 9
        LOADI R1, 1
loop:   STORE R0, DISPLAY
        SUB   R0, R1        ; sets the zero flag when R0 reaches 0...
        JNZ   loop          ; ...which is what JNZ checks
        STORE R0, DISPLAY   ; show the final 0
        HALT
