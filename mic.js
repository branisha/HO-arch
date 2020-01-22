class Brain{
    constructor(){
        this.name = "wat";
    }

    printName() {
        alert(this.name);    
    }
}

const ERROR_registerOverflow         = "Register write: overflow.";
const ERROR_registerWriteInImmutable = "Register write: immutable.";
const ERROR_aluInputOverflow         = "ALU input: overflow.";
const ERROR_shifterInputOverflow     = "Shifter input: overflow.";
const ERROR_shifterNotDefiner        = "Shifter action: not defined.";
const ERROR_bankRegisterNotDefined   = "Register bank: register not defined.";


function logError(message){
    console.trace();
    if( confirm(message + "\nMore info printed in console.\nInvoke debugger?") ) debugger;
}


let debugLogLevel = 1;


function debugLogger(stringValue, level){
    if(level >= debugLogLevel)  console.log(stringValue);
}   


function numberToHex(number, padding_inBits=0) {
    return "0x" + number.toString(16).padStart(padding_inBits/8, "0");
}


class Register{
    constructor(sizeInBytes, value="\0", mutable=true){
        this._mutable = mutable;
        this.size = Math.pow(2, sizeInBytes*8);
        if(value != "\0")   this.register = value & (this.size - 1);
        else                this.register = value.repeat(sizeInBytes);
        this.size = Math.pow(2, sizeInBytes*8);
    }

    get value(){
        return this.register;
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
        this.register = number;
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
    _C      = 0b00000000000000000000111100000000;
    _addr   = 0b00000000000000000000000011111111;

    get AMUX(){
        return this.register & this._amux;
    }
    get COND(){
        return this.register & this._cond;
    }
    get ALU(){
        return this.register & this._alu;
    }
    get SH(){
        return this.register & this._sh;
    }
    get MBR(){
        return this.register & this._mbr;
    }
    get MAR(){
        return this.register & this._mar;
    }
    get RD(){
        return this.register & this._rd;
    }
    get ENC(){
        return this.register & this._enc;
    }
    get C(){
        return this.register & this._C;
    }
    get B(){
        return this.register & this._B;
    }
    get A(){
        return this.register & this._A;
    }
    get ADDR(){
        return this.register & this._addr;
    }
    

}

class MIC_seq_logic{
    constructor(){
        this.instruction_size = 4; // bytes
        this.program_memory = new Array(256 * this.instruction_size);

        // init mem to 0
        for(let i = 0; i < this.program_memory.length; i++) this.program_memory[i] = "\0";

        this.MIR_register = new MIR(this.instruction_size);
        this.MPC = 0;   // program counter
    }

    subcycle1(){
        debugLogger("Running subcycle 1", 1);
        debugLogger("Current MPC: " + this.MPC, 2);
        let next_instuction = this.program_memory[this.MPC];
        for(let i = 1; i < this.instruction_size; i++){
            next_instuction = next_instuction << 8 | this.program_memory[this.MPC + i];
        }
        debugLogger("Next instruction is: 0x" + next_instuction.toString(16).toUpperCase(), 2);
        this.MIR_register.value = next_instuction;
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

    clearFlags(){ this._flag_N = this._flag_Z = 0;}

    internalDoState(){
        this.clearFlags();

        if      (this._A & this._B > 0) this._E = ~this.inputA & this._input_mask;
        else if (this._A > 0)           this._E = this.inputA;
        else if (this._B > 0)           this._E = this.inputA & this.inputB;
        else                            this._E = (this.inputA + this.inputB) & this._input_mask;
        
        if(this._E == 0)                        this._flag_Z = 1;
        else if((this._E & (this._input_size >> 1)) > 0) this._flag_N = 1;

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

    internalDoState(){
        if(this._A & this._B > 0){
            logError(ERROR_shifterNotDefiner);
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
            this.registerArray[i] = new Register(4);
        }
        
        this.registerArray[5] = new Register(4, "\0", false);  // 0
        this.registerArray[6] = new Register(4, 1, false);     // +1
        this.registerArray[7] = new Register(4, -1, false);    // -1
        this.registerArray[8] = new Register(4, 0x0FFF, false);// AMASK
        this.registerArray[9] = new Register(4, 0x00FF, false);// SMASK
       
        // A to F
        for(let i = 10; i < 16; i++){
            this.registerArray[i] = new Register(4);
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
}




let logic = new MIC_seq_logic();
logic.program_memory[0] = 0xDE;
logic.program_memory[1] = 0xBF;
logic.program_memory[3] = 0x5C;
logic.subcycle1();
logic.MIR_register.value = 1212;
console.log("End print");
console.log((logic.MIR_register.register >>> 0).toString(2));
console.log("AMUX TST")
console.log(logic.MIR_register.COND.toString(2));

console.log("Alu unit");
let alu = new ALU(1);

let a_val = 0b10011010;
let b_val = 0x1;

let a_fl = 0;
let b_fl = 0;

alu._A = a_fl;
alu._B = b_fl;
alu.inputA = 0b10001001;
alu.inputB = -0b11000001;
alu.internalDoState();
console.log("A is :" + a_val.toString(2));
console.log("OUtput is :" + alu.output);
console.log(alu.output.toString(2));
console.log("N flag");
console.log(alu._flag_N);
console.log("Alu size " + alu.size);

console.log("Shifter----------")
let shift = new Shifter(1);

shift._A = 0;
shift._B = 0;

shift.input = 0b010;
shift.internalDoState();

console.log("Output");
console.log(shift.output);

console.log("iNPUT SIZE");
console.log(shift._input_size);
console.log("iNPUT mask");
console.log(shift._input_mask);

let test = new RegisterBank();

console.log(test.registerAtIndex(0));
console.log(test.registerByName("PC"));
console.log(test.registerByName("ACs"));