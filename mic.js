class Brain{
    constructor(){
        this.name = "wat";
    }

    printName() {
        alert(this.name);    
    }
}

const ERROR_registerOverflow                = "Register write: overflow.";
const ERROR_registerWriteInImmutable        = "Register write: immutable.";
const ERROR_aluInputOverflow                = "ALU input: overflow.";
const ERROR_shifterInputOverflow            = "Shifter input: overflow.";
const ERROR_shifterNotDefiner               = "Shifter action: not defined.";
const ERROR_bankRegisterNotDefined          = "Register bank: register not defined.";
const ERROR_bankRegisterNotRegisterAtBus    = "Register bank: Try to assign object that is not register to bus.";
const ERROR_bankRegisterNotDefinedInBank    = "Register bank: Try to assign register that is not in bank.";
const ERROR_MCUwrAndRd                      = "MCU: can't read and write in the same cycle.";

function logError(message){
    console.trace();
    if( confirm(message + "\nMore info printed in console.\nInvoke debugger?") ) debugger;
}


let debugLogLevel = 1;


function debugLogger(stringValue, level){
    if(level >= debugLogLevel)  console.log(stringValue);
}   


function numberToHex(number, padding_inBytes) {
    let mask = 0;
    for(let i = 0; i < padding_inBytes * 8; i++){
        mask |= 1 << i;
    }
    return "0x" + ((number & mask) >>> 0).toString(16).padStart(padding_inBytes*2, "0");
}

function numberToBin(number, padding_inBits) {
    let mask = 0;
    for(let i = 0; i < padding_inBits; i++){
        mask |= 1 << i;
    }
    return "0b" + ((number & mask) >>> 0).toString(2).padStart(padding_inBits, "0");
}

function numberToBitWidth(_byte){
    return Math.ceil(Math.log2(_byte));
}


class Register{
    constructor(sizeInBytes, value=0, mutable=true){
        this._mutable = mutable;
        this.size = Math.pow(2, sizeInBytes*8);
        this._mask = this.size - 1;
        this._register = value & (this.size - 1);
    //    if(value != "\0")   this.register = value & (this.size - 1);
    //    else                this.register = value.repeat(sizeInBytes);

    }

    sizeInBytes(){
        return Math.ceil(Math.log2(this.size));
    }

    get value(){
        return this._register;
    }
    set value(number){
        if(!this._mutable){
            logError(ERROR_registerWriteInImmutable);
            return;
        }
        if(number >= this.size){
            logError(ERROR_registerOverflow);
            return;
        }
        this._register = number;
    }

    registerValueHexString(){
        return numberToHex(this._register, Math.log2(this.size)/8);
    }

}

class MIR extends Register{

    // register bitmasks
    // written in binary to be more human appealing
    _amux   = 0b10000000000000000000000000000000;
    _cond   = 0b01100000000000000000000000000000;
    _alu    = 0b00011000000000000000000000000000;
    _sh     = 0b00000110000000000000000000000000;
    _mbr    = 0b00000001000000000000000000000000;
    _mar    = 0b00000000100000000000000000000000;
    _rd     = 0b00000000010000000000000000000000;
    _wr     = 0b00000000001000000000000000000000;
    _enc    = 0b00000000000100000000000000000000;
    _C      = 0b00000000000011110000000000000000;
    _B      = 0b00000000000000001111000000000000;
    _A      = 0b00000000000000000000111100000000;
    _addr   = 0b00000000000000000000000011111111;

    _maskToNumber(mask){
        while((mask & 1) < 1) mask = mask >> 1;
        return mask;
    }

    _numberFromMask(mask){
        let stringMask = mask.toString(2).padStart(this.sizeInBytes(), "0");
        let delta = stringMask.length - 1 - stringMask.lastIndexOf("1");
        return (this.value & mask) >> delta;
    }

    get AMUX(){
        return this._numberFromMask(this._amux);
    }
    get COND(){
        return this._numberFromMask(this._cond);
    }
    get ALU(){
        return this._numberFromMask(this._alu);
    }
    get SH(){
        return this._numberFromMask(this._sh);
    }
    get MBR(){
        return this._numberFromMask(this._mbr);
    }
    get MAR(){
        return this._numberFromMask(this._mar);
    }
    get RD(){
        return this._numberFromMask(this._rd);
    }
    get WR(){
        return this._numberFromMask(this._wr);
    }
    get ENC(){
        return this._numberFromMask(this._enc);
    }
    get C(){
        return this._numberFromMask(this._C);
    }
    get B(){
        return this._numberFromMask(this._B);
    }
    get A(){
        return this._numberFromMask(this._A);
    }
    get ADDR(){
        return this._numberFromMask(this._addr);
    }

    printLogState(){
        console.log("MIR state: ");
        console.log("AMUX: "    + (this.AMUX * -1).toString(2));
        console.log("COND: "    + this.COND.toString(2));
        console.log("ALU: "     + this.ALU.toString(2));
        console.log("SH: "      + this.SH.toString(2));
        console.log("MBR: "     + this.MBR.toString(2));
        console.log("MAR: "     + this.MAR.toString(2));
        console.log("RD: "      + this.RD.toString(2));
        console.log("WR: "      + this.WR.toString(2));
        console.log("ENC: "     + this.ENC.toString(2));
        console.log("C: "       + this.C.toString(2));
        console.log("B: "       + this.B.toString(2));
        console.log("A: "       + this.A.toString(2));
        console.log("ADDR: "    + this.ADDR.toString(2));

    }
}


class ALU{
    
    // TODO: Unit tests

    /*  
        2 bit input for state

        states:
        A   B   E
        0   0   A +   B
        0   1   A AND B
        1   0   A
        1   1   Inv(A)

        output flags:
        Z if E 0
        N if E < 0
    */

    constructor(inputSizeBytes){
        this._input_size = Math.pow(2, inputSizeBytes * 8);
        this._input_mask = this._input_size - 1;

        this._A = 0;
        this._B = 0;
        this._E = 0;

        this._input_A = 0;
        this._input_B = 0;

        this._flag_Z = 0;
        this._flag_N = 0;
    }

    printLogState(){
        console.log("ALU:");
        console.log("A flag: " + this._A.toString());
        console.log("B flag: " + this._B.toString());
        console.log("Input at A: " + numberToHex(this._input_A, Math.ceil(Math.log2(this._input_mask))/16));
        console.log("Input at B: " + numberToHex(this._input_B, Math.ceil(Math.log2(this._input_mask))/16));

        console.log("Current output: " + numberToHex(this._input_B, Math.ceil(Math.log2(this._input_mask))/16));

        
        console.log("Flag Z: " + this._flag_Z.toString());
        console.log("Flag N: " + this._flag_N.toString());


}

    get inputA(){
        return this._input_A & this._input_mask;
    }
    get inputB(){
        return this._input_B & this._input_mask;
    }

    set inputA(number){
        if(number > this._input_mask){
            logError(ERROR_aluInputOverflow);
            return;
        }

        this._input_A = number;
    }

    set inputB(number){
        if(number > this._input_mask){
            logError(ERROR_aluInputOverflow);
            return;
        }
        this._input_B = number;
    }

    get output(){
        return this._E;
    }

    set flagA(num){
        this._A = num;
    }

    set flagB(num){
        this._B = num;
    }

    get flagZ(){
        return this._flag_Z;
    }

    get flagN(){
        return this._flag_N;
    }

    clearFlags(){ this._flag_N = this._flag_Z = 0;}

    internalDoState(){
        this.clearFlags();

        if (this._A & this._B > 0){
            // 1 1
            debugLogger("Alu operation: ~A" ,3);
            this._E = ~this.inputA & this._input_mask;
        } 
        else if (this._A > 0){
            // 1 0
            debugLogger("Alu operation: A" ,3);
            this._E = this.inputA;
        }           
        else if (this._B > 0){
            // 0 1
            debugLogger("Alu operation: A and B" ,3);
            this._E = this.inputA & this.inputB;
        }         
        else{
            // 0 0
            debugLogger("Alu operation: A + B" ,3);
            this._E = (this.inputA + this.inputB) & this._input_mask;
        }                          
        
        if(this._E == 0){
            debugLogger("Alu operation: Z flag set" ,3);
            this._flag_Z = 1;
        }                       
        else if((this._E & (this._input_size >> 1)) > 0){
            debugLogger("Alu operation: N flag set" ,3);
            this._flag_N = 1;
        }

        debugLogger("Alu operation output: "+ this.output, 3);

        return;
    } 

}

class Shifter{

    // TODO: unit tests
    // code redundancy from ALU
    
    /*  shifter logic
        A   B   E
        0   0   input
        0   1   input >> 1
        1   0   input << 1
        1   1   not used
    */

    constructor(sizeInBytes){
        this._input_size = Math.pow(2, sizeInBytes * 8);
        this._input_mask = this._input_size - 1;

        this._A = 0;
        this._B = 0;
        this._E = 0;

        this._input = 0;
    }

    get input(){
        return this._input & this._input_mask;
    }

    set input(number){
        if(number > this._input_mask){
            logError(ERROR_shifterInputOverflow);
            return;
        }

        this._input = number;
    }

    get output(){
        return this._E;
    }

    set flagA(num){
        this._A = num;
    }

    set flagB(num){
        this._B = num;
    }

    internalDoState(){
        if(this._A > 0 && this._B > 0){
            logError(ERROR_shifterNotDefiner);
            return;
        }

        if      (this._A > 0)   this._E = (this.input << 1) & this._input_mask;
        else if (this._B > 0)   this._E = (this.input >> 1) & this._input_mask;
        else                    this._E =  this.input;

        return;
    } 

}

class RegisterBank{
    constructor(){

        this.registerArray = new Array(16);
        // PC to TIR
        for(let i = 0; i < 5; i++){
            this.registerArray[i] = new Register(2);
        }
        
        this.registerArray[5] = new Register(2, 0, false);  // 0
        this.registerArray[6] = new Register(2, 1, false);     // +1
        this.registerArray[7] = new Register(2, -1, false);    // -1
        this.registerArray[8] = new Register(2, 0x0FFF, false);// AMASK
        this.registerArray[9] = new Register(2, 0x00FF, false);// SMASK
       
        // A to F
        for(let i = 10; i < 16; i++){
            this.registerArray[i] = new Register(2);
        }

        this.registerNames = new Object();
        this.registerNames["PC"]    = 0;
        this.registerNames["AC"]    = 1;
        this.registerNames["SP"]    = 2;
        this.registerNames["IR"]    = 3;
        this.registerNames["TIR"]   = 4;
        this.registerNames["0"]     = 5;
        this.registerNames["+1"]    = 6;
        this.registerNames["-1"]    = 7;
        this.registerNames["AMASK"] = 8;
        this.registerNames["SMASK"] = 9;
        this.registerNames["A"]     = 10;
        this.registerNames["B"]     = 11;
        this.registerNames["C"]     = 12;
        this.registerNames["D"]     = 13;
        this.registerNames["E"]     = 14;
        this.registerNames["F"]     = 15;

        this.registerArray[0].value = 0b01;

        // defaults to first register
        this._A_bus = this.registerArray[0];
        this._B_bus = this.registerArray[0];
        this._C_bus = this.registerArray[0];

        this._updateCbank = 0;
    }

    registerAtIndex(index){
        return this.registerArray[index];
    }

    registerByName(name){
        if(!Object.keys(this.registerNames).includes(name)){
            logError(ERROR_bankRegisterNotDefined);
            return;
        }
        return this.registerArray[this.registerNames[name]];
    }

    set busRegisterA(register){
        if(! register instanceof Register){
            logError(ERROR_bankRegisterNotRegisterAtBus);
            return;
        }
        if(! this.registerArray.includes(register)){
            logError(ERROR_bankRegisterNotDefinedInBank);
            return;
        }
        this._A_bus = register;
    }

    set busRegisterB(register){
        if(! register instanceof Register){
            logError(ERROR_bankRegisterNotRegisterAtBus);
            return;
        }
        if(! this.registerArray.includes(register)){
            logError(ERROR_bankRegisterNotDefinedInBank);
            return;
        }
        this._B_bus = register;
    }

    set busRegisterC(register){
        if(! register instanceof Register){
            logError(ERROR_bankRegisterNotRegisterAtBus);
            return;
        }
        if(! this.registerArray.includes(register)){
            logError(ERROR_bankRegisterNotDefinedInBank);
            return;
        }
        this._C_bus = register;
    }

    get busRegisterA(){
        return this._A_bus;
    }
    get busRegisterB(){
        return this._B_bus;
    }
    get busRegisterC(){
        return this._C_bus;
    }

    get updateCbank(){
        return this._updateCbank;
    }

    set updateCbank(num){
        this._updateCbank = num;
    }

    unsetBuses(){
        this._A_bus = this._B_bus = this._C_bus = null;
    }

    printToLog(){
        Object.keys(this.registerNames).forEach(key => {
            console.log(key + ":\t" + this.registerByName(key).registerValueHexString());
        });
    }

}


class RamRegister extends Register{
    /**
     * Special registers for I/O with RAM
     * In design called MAR and MBR
     */
    constructor(...args){
        super(...args);

        this._lastCycleOp = 0; // when this is set to 1 and thisCycleOp is set to 1, read/write value and set data in reg
        this._thisCycleOp = 0; // when this is set to 1, next cycle op will happend 

        this._lastOp = 0; // RD or WR | 1 -> RD, 2 -> WR
        this._thisOp = 0; // RD or WR, both need to match to execute 
    }

    get lastCycleOP(){
        return this._lastCycleOp;
    }
    get thisCycleOP(){
        return this._thisCycleOp;
    }
    set lastCycleOP(num){
        this._lastCycleOp = num;
    }
    set thisCycleOP(num){
        this._thisCycleOp = num;
    }

    get lastOp(){
        return this._lastOp;
    }
    get thisOp(){
        return this._thisOp;
    }
    set lastOp(num){
        this._lastOp = num;
    }
    set thisOp(num){
        this._thisOp = num;
    }

    get opFlag(){
        return this._flagSet;
    }

    set opFlag(num){
        this._flagSet = num;
    }

    get willUpdate(){
        return this._willUpdate;
    }

    set willUpdate(num){
        this._willUpdate = num;;
    }

    setOpFlag(){
        this._flagSet = 1;
    }

    clearOpFlag(){
        this._flagSet = 0;
    }

    isFlagSet(){
        return this._flagSet > 0;
    }
}


class MIC_seq_logic{
    /**
     * Heart and brain of the architecture
     */
    constructor(){
        this.instruction_size = 4; // bytes
        this.program_memory = new Array(256 * this.instruction_size);

        // init mem to 0
        for(let i = 0; i < this.program_memory.length; i++) this.program_memory[i] = "\0";

        this.MIR_register = new MIR(this.instruction_size);
        this.MPC = 0;   // program counter

        this.registerBank = new RegisterBank();
        this.MBR_register = new RamRegister(2);
        this.MAR_register = new RamRegister(2);

        this.ALU = new ALU(this.instruction_size);
        this.shifter = new Shifter(this.instruction_size);

        this._current_subcycle = 0;

        this._dummyRam = new Array();

        for(let i = 0; i < 4096; i++) this._dummyRam.push(0);
    }


    subcycle1(){
        debugLogger("Running subcycle 1", 1);
        debugLogger("Current MPC: " + this.MPC, 2);
        let next_instruction = this.program_memory[this.MPC];
       /* for(let i = 1; i < this.instruction_size; i++){
            next_instruction = next_instruction << 8 | this.program_memory[this.MPC + i];
        }*/
        debugLogger("Next instruction is: " + numberToHex(next_instruction, this.instruction_size), 1);
        this.MIR_register.value = next_instruction;
        this._current_subcycle++;
    }

    subcycle2(){
        debugLogger("Running subcycle 1", 1);
        debugLogger("Propagating signals", 1);

        // procesing instruction from left to right
        // setup bits first, values second
        // cond value read at the 4 subcycle
        this.ALU.flagA = this.MIR_register.ALU & 0x2;
        this.ALU.flagB = this.MIR_register.ALU & 0x1;

        this.shifter.flagA = this.MIR_register.SH & 0x2;
        this.shifter.flagB = this.MIR_register.SH & 0x1;


        // obsolete
        this.MBR_register.willUpdate = this.MIR_register.MBR;
        this.MAR_register.willUpdate = this.MIR_register.MAR;
        // obsolete
        this.MAR_register.opFlag = this.MIR_register.RD;
        this.MBR_register.opFlag = this.MIR_register.WR;

        this.registerBank.updateCbank = this.MIR_register.ENC;


        this.registerBank.busRegisterC = this.registerBank.registerAtIndex(this.MIR_register.C);
        this.registerBank.busRegisterB = this.registerBank.registerAtIndex(this.MIR_register.B);
        this.registerBank.busRegisterA = this.registerBank.registerAtIndex(this.MIR_register.A);

        // addr value read at the 4 subcycle
        debugLogger("Propagating register values", 1);

        if(this.MIR_register.AMUX > 0){
            this.ALU.inputA = this.MBR_register.value;
        }else{
            this.ALU.inputA = this.registerBank.busRegisterA.value;
        }

        this.ALU.inputB = this.registerBank.busRegisterB.value;

        if(this.MAR_register.willUpdate > 0){
            this.MAR_register.value = this.registerBank.busRegisterB.value;
        }

        this._current_subcycle++;

        
    }

    subcycle3(){
        // alu and shifter operations

        this.ALU.internalDoState();
        this.shifter.input = this.ALU.output;
        this.shifter.internalDoState();
        this._current_subcycle++;
    }

    subcycle4(){
        // lets take care of MBR and MAR
        
        // not allowed
        if(this.MIR_register.WR > 0 && this.MIR_register.RD > 0){
            logError(ERROR_MCUwrAndRd);
            return;
        }


        // They are the same subclasses, but we will use MBR as main check
        // shift MBR first
        this.MBR_register.lastCycleOP = this.MBR_register.thisCycleOP;
        this.MBR_register.thisCycleOP = 0;
        this.MBR_register.lastOp = this.MBR_register.thisOp;
        this.MBR_register.thisOp = 0;
        // now update value for this cycle
        this.MBR_register.thisCycleOP = this.MIR_register.RD | this.MIR_register.WR;
        if(this.MIR_register.RD > 0){
            debugLogger("RD SET",3);
            this.MBR_register.thisOp = 1;
        }
        if(this.MIR_register.WR > 0){
            debugLogger("WR SET",3);
            this.MBR_register.thisOp = 2;
        }

        // do the op
        if(this.MBR_register.lastCycleOP > 0 && this.MBR_register.thisCycleOP > 0
            && this.MBR_register.lastOp == this.MBR_register.thisOp){
                
            if(this.MBR_register.thisOp == 1){
           
                if(this.MIR_register.RD > 0){
                    // do read
                    debugLogger("Reading from ram at addr: " + this.MAR_register.value, 2);
                    this.MBR_register.value = this._dummyRam[this.MAR_register.value];
                    this.MBR_register.thisOp = this.MBR_register.lastOp = 0;
                    this.MBR_register.thisCycleOP = this.MBR_register.lastCycleOP = 0;
                }
            }else if(this.MBR_register.thisOp == 2){
     

                if(this.MIR_register.WR > 0){
                    // do write
                    debugLogger("Writing to ram at addr: " + this.MAR_register.value, 2);
                    this._dummyRam[this.MAR_register.value] = this.MBR_register.value;
                    this.MBR_register.thisOp = this.MBR_register.lastOp = 0;
                    this.MBR_register.thisCycleOP = this.MBR_register.lastCycleOP = 0;
                }
            }

        }
        
        // we continue with ALU
        // first check flush to MBR
        if(this.MIR_register.MBR > 0){
            this.MBR_register.value = this.shifter.output;
        }
        // second for C reg
        if(this.MIR_register.ENC > 0){
            this.registerBank.busRegisterC.value = this.shifter.output;
        }

        // last step is checking for JUMP and Z/N Flags
        if(this.ALU.flagN < 1 && this.ALU.flagZ < 1){
            // no flag set
            // increment and thats it
            this.MPC++;
        }else{

            if(this.MIR_register.COND >= 0b11){
                // jump always
                this.MPC = this.MIR_register.ADDR;
            }

            if(this.ALU.flagN > 0 && (this.MIR_register.COND & 1) > 0){
                // jump negative
                this.MPC = this.MIR_register.ADDR;
            }
            if(this.ALU.flagZ > 0 && (this.MIR_register.COND & 2) > 0){
                // jump zero
                this.MPC = this.MIR_register.ADDR;
            }
        }

        this._current_subcycle=0;
    }

    printLogState(){
        console.log("Current subcycle: " + this._current_subcycle);
        console.log("MPC: " + this.MPC);
        this.MIR_register.printLogState();
        this.ALU.printLogState();

    }

    doFullCycle(){
        this.subcycle1();
        this.subcycle2();
        this.subcycle3();
        this.subcycle4();
    }


}

let logic = new MIC_seq_logic();

logic.program_memory[0] = 0b00010001101000001011101000000000;
logic.program_memory[1] = 0b00000000001000000000000000000000;
logic.program_memory[2] = 0b00010001110000001011101000000000;
logic.program_memory[3] = 0b00000000010000000000000000000000;
logic.registerBank.registerByName("A").value = 12; 
logic.registerBank.registerByName("B").value = 1; 

logic.doFullCycle();
logic.doFullCycle();

logic._dummyRam[0] = 5;
logic.registerBank.registerByName("B").value = 0; 
logic.doFullCycle();
logic.doFullCycle();

console.log(logic);

// TODO check jump conditions
//      improve logging