/**
 * @license
 * Copyright 2012 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Helper functions for generating Python for blocks.
 * @suppress {checkTypes|globalThis}
 */

import * as goog from '../../closure/goog/goog.js';
goog.declareModuleId('Blockly.Python');

import * as stringUtils from '../../core/utils/string.js';
import * as Variables from '../../core/variables.js';
// import type {Block} from '../../core/block.js';
import {CodeGenerator} from '../../core/generator.js';
import {Names, NameType} from '../../core/names.js';
// import type {Workspace} from '../../core/workspace.js';
import {inputTypes} from '../../core/inputs/input_types.js';


/**
 * Order of operation ENUMs.
 * http://docs.python.org/reference/expressions.html#summary
 * @enum {number}
 */
export const Order = {
  ATOMIC: 0,             // 0 "" ...
  COLLECTION: 1,         // tuples, lists, dictionaries
  STRING_CONVERSION: 1,  // `expression...`
  MEMBER: 2.1,           // . []
  FUNCTION_CALL: 2.2,    // ()
  EXPONENTIATION: 3,     // **
  UNARY_SIGN: 4,         // + -
  BITWISE_NOT: 4,        // ~
  MULTIPLICATIVE: 5,     // * / // %
  ADDITIVE: 6,           // + -
  BITWISE_SHIFT: 7,      // << >>
  BITWISE_AND: 8,        // &
  BITWISE_XOR: 9,        // ^
  BITWISE_OR: 10,        // |
  RELATIONAL: 11,        // in, not in, is, is not, >, >=, <>, !=, ==
  LOGICAL_NOT: 12,       // not
  LOGICAL_AND: 13,       // and
  LOGICAL_OR: 14,        // or
  CONDITIONAL: 15,       // if else
  LAMBDA: 16,            // lambda
  NONE: 99,              // (...)
};

/**
 * PythonScript code generator class.
 */
export class PythonGenerator extends CodeGenerator {
  /**
   * List of outer-inner pairings that do NOT require parentheses.
   * @type {!Array<!Array<number>>}
   */
  ORDER_OVERRIDES = [
    // (foo()).bar -> foo().bar
    // (foo())[0] -> foo()[0]
    [Order.FUNCTION_CALL, Order.MEMBER],
    // (foo())() -> foo()()
    [Order.FUNCTION_CALL, Order.FUNCTION_CALL],
    // (foo.bar).baz -> foo.bar.baz
    // (foo.bar)[0] -> foo.bar[0]
    // (foo[0]).bar -> foo[0].bar
    // (foo[0])[1] -> foo[0][1]
    [Order.MEMBER, Order.MEMBER],
    // (foo.bar)() -> foo.bar()
    // (foo[0])() -> foo[0]()
    [Order.MEMBER, Order.FUNCTION_CALL],

    // not (not foo) -> not not foo
    [Order.LOGICAL_NOT, Order.LOGICAL_NOT],
    // a and (b and c) -> a and b and c
    [Order.LOGICAL_AND, Order.LOGICAL_AND],
    // a or (b or c) -> a or b or c
    [Order.LOGICAL_OR, Order.LOGICAL_OR]
  ];

  constructor(name) {
    super(name ?? 'Python');
    this.isInitialized = false;

    // Copy Order values onto instance for backwards compatibility
    // while ensuring they are not part of the publically-advertised
    // API.
    //
    // TODO(#7085): deprecate these in due course.  (Could initially
    // replace data properties with get accessors that call
    // deprecate.warn().)
    for (const key in Order) {
      this['ORDER_' + key] = Order[key];
    }

    // List of illegal variable names.  This is not intended to be a
    // security feature.  Blockly is 100% client-side, so bypassing
    // this list is trivial.  This is intended to prevent users from
    // accidentally clobbering a built-in object or function.
    this.addReservedWords(
      // import keyword
      // print(','.join(sorted(keyword.kwlist)))
      // https://docs.python.org/3/reference/lexical_analysis.html#keywords
      // https://docs.python.org/2/reference/lexical_analysis.html#keywords
      'False,None,True,and,as,assert,break,class,continue,def,del,elif,else,' +
      'except,exec,finally,for,from,global,if,import,in,is,lambda,nonlocal,' +
      'not,or,pass,print,raise,return,try,while,with,yield,' +
      // https://docs.python.org/3/library/constants.html
      // https://docs.python.org/2/library/constants.html
      'NotImplemented,Ellipsis,__debug__,quit,exit,copyright,license,credits,' +
      // >>> print(','.join(sorted(dir(__builtins__))))
      // https://docs.python.org/3/library/functions.html
      // https://docs.python.org/2/library/functions.html
      'ArithmeticError,AssertionError,AttributeError,BaseException,' +
      'BlockingIOError,BrokenPipeError,BufferError,BytesWarning,' +
      'ChildProcessError,ConnectionAbortedError,ConnectionError,' +
      'ConnectionRefusedError,ConnectionResetError,DeprecationWarning,' +
      'EOFError,Ellipsis,EnvironmentError,Exception,FileExistsError,' +
      'FileNotFoundError,FloatingPointError,FutureWarning,GeneratorExit,' +
      'IOError,ImportError,ImportWarning,IndentationError,IndexError,' +
      'InterruptedError,IsADirectoryError,KeyError,KeyboardInterrupt,' +
      'LookupError,MemoryError,ModuleNotFoundError,NameError,' +
      'NotADirectoryError,NotImplemented,NotImplementedError,OSError,' +
      'OverflowError,PendingDeprecationWarning,PermissionError,' +
      'ProcessLookupError,RecursionError,ReferenceError,ResourceWarning,' +
      'RuntimeError,RuntimeWarning,StandardError,StopAsyncIteration,' +
      'StopIteration,SyntaxError,SyntaxWarning,SystemError,SystemExit,' +
      'TabError,TimeoutError,TypeError,UnboundLocalError,UnicodeDecodeError,' +
      'UnicodeEncodeError,UnicodeError,UnicodeTranslateError,UnicodeWarning,' +
      'UserWarning,ValueError,Warning,ZeroDivisionError,_,__build_class__,' +
      '__debug__,__doc__,__import__,__loader__,__name__,__package__,__spec__,' +
      'abs,all,any,apply,ascii,basestring,bin,bool,buffer,bytearray,bytes,' +
      'callable,chr,classmethod,cmp,coerce,compile,complex,copyright,credits,' +
      'delattr,dict,dir,divmod,enumerate,eval,exec,execfile,exit,file,filter,' +
      'float,format,frozenset,getattr,globals,hasattr,hash,help,hex,id,input,' +
      'int,intern,isinstance,issubclass,iter,len,license,list,locals,long,' +
      'map,max,memoryview,min,next,object,oct,open,ord,pow,print,property,' +
      'quit,range,raw_input,reduce,reload,repr,reversed,round,set,setattr,' +
      'slice,sorted,staticmethod,str,sum,super,tuple,type,unichr,unicode,' +
      'vars,xrange,zip'
    );
  }

  /**
   * Initialise the database of variable names.
   * @param {!Workspace} workspace Workspace to generate code from.
   * @this {CodeGenerator}
   */
  init(workspace) {
    super.init(workspace);

    /**
     * Empty loops or conditionals are not allowed in Python.
     */
    this.PASS = this.INDENT + 'pass\n';

    if (!this.nameDB_) {
      this.nameDB_ = new Names(this.RESERVED_WORDS_);
    } else {
      this.nameDB_.reset();
    }

    this.nameDB_.setVariableMap(workspace.getVariableMap());
    this.nameDB_.populateVariables(workspace);
    this.nameDB_.populateProcedures(workspace);

    const defvars = [];
    // Add developer variables (not created or named by the user).
    const devVarList = Variables.allDeveloperVariables(workspace);
    for (let i = 0; i < devVarList.length; i++) {
      defvars.push(
          this.nameDB_.getName(devVarList[i], Names.DEVELOPER_VARIABLE_TYPE) +
          ' = None');
    }

    // Add user variables, but only ones that are being used.
    const variables = Variables.allUsedVarModels(workspace);
    for (let i = 0; i < variables.length; i++) {
      defvars.push(
          this.nameDB_.getName(variables[i].getId(), NameType.VARIABLE) +
          ' = None');
    }

    this.definitions_['variables'] = defvars.join('\n');
    this.isInitialized = true;
  }

  /**
   * Prepend the generated code with import statements and variable definitions.
   * @param {string} code Generated code.
   * @return {string} Completed code.
   */
  finish(code) {
    // Convert the definitions dictionary into a list.
    const imports = [];
    const definitions = [];
    for (let name in this.definitions_) {
      const def = this.definitions_[name];
      if (def.match(/^(from\s+\S+\s+)?import\s+\S+/)) {
        imports.push(def);
      } else {
        definitions.push(def);
      }
    }
    // Call Blockly.CodeGenerator's finish.
    code = super.finish(code);
    this.isInitialized = false;

    this.nameDB_.reset();
    const allDefs = imports.join('\n') + '\n\n' + definitions.join('\n\n');
    return allDefs.replace(/\n\n+/g, '\n\n').replace(/\n*$/, '\n\n\n') + code;
  }

  /**
   * Naked values are top-level blocks with outputs that aren't plugged into
   * anything.
   * @param {string} line Line of generated code.
   * @return {string} Legal line of code.
   */
  scrubNakedValue(line) {
    return line + '\n';
  }

  /**
   * Encode a string as a properly escaped Python string, complete with quotes.
   * @param {string} string Text to encode.
   * @return {string} Python string.
   * @protected
   */
  quote_(string) {
    string = string.replace(/\\/g, '\\\\').replace(/\n/g, '\\\n');

    // Follow the CPython behaviour of repr() for a non-byte string.
    let quote = '\'';
    if (string.indexOf('\'') !== -1) {
      if (string.indexOf('"') === -1) {
        quote = '"';
      } else {
        string = string.replace(/'/g, '\\\'');
      }
    }
    return quote + string + quote;
  }

  /**
   * Encode a string as a properly escaped multiline Python string, complete
   * with quotes.
   * @param {string} string Text to encode.
   * @return {string} Python string.
   * @protected
   */
  multiline_quote_(string) {
    const lines = string.split(/\n/g).map(this.quote_);
    // Join with the following, plus a newline:
    // + '\n' +
    return lines.join(' + \'\\n\' + \n');
  }

  /**
   * Common tasks for generating Python from blocks.
   * Handles comments for the specified block and any connected value blocks.
   * Calls any statements following this block.
   * @param {!Block} block The current block.
   * @param {string} code The Python code created for this block.
   * @param {boolean=} opt_thisOnly True to generate code for only this statement.
   * @return {string} Python code with comments and subsequent blocks added.
   * @protected
   */
  scrub_(block, code, opt_thisOnly) {
    let commentCode = '';
    // Only collect comments for blocks that aren't inline.
    if (!block.outputConnection || !block.outputConnection.targetConnection) {
      // Collect comment for this block.
      let comment = block.getCommentText();
      if (comment) {
        comment = stringUtils.wrap(comment, this.COMMENT_WRAP - 3);
        commentCode += this.prefixLines(comment + '\n', '# ');
      }
      // Collect comments for all value arguments.
      // Don't collect comments for nested statements.
      for (let i = 0; i < block.inputList.length; i++) {
        if (block.inputList[i].type === inputTypes.VALUE) {
          const childBlock = block.inputList[i].connection.targetBlock();
          if (childBlock) {
            comment = this.allNestedComments(childBlock);
            if (comment) {
              commentCode += this.prefixLines(comment, '# ');
            }
          }
        }
      }
    }
    const nextBlock = block.nextConnection && block.nextConnection.targetBlock();
    const nextCode = opt_thisOnly ? '' : this.blockToCode(nextBlock);
    return commentCode + code + nextCode;
  }

  /**
   * Gets a property and adjusts the value, taking into account indexing.
   * If a static int, casts to an integer, otherwise returns a code string.
   * @param {!Block} block The block.
   * @param {string} atId The property ID of the element to get.
   * @param {number=} opt_delta Value to add.
   * @param {boolean=} opt_negate Whether to negate the value.
   * @return {string|number}
   */
  getAdjustedInt(block, atId, opt_delta, opt_negate) {
    let delta = opt_delta || 0;
    if (block.workspace.options.oneBasedIndex) {
      delta--;
    }
    const defaultAtIndex = block.workspace.options.oneBasedIndex ? '1' : '0';
    const atOrder = delta ? this.ORDER_ADDITIVE : this.ORDER_NONE;
    let at = this.valueToCode(block, atId, atOrder) || defaultAtIndex;

    if (stringUtils.isNumber(at)) {
      // If the index is a naked number, adjust it right now.
      at = parseInt(at, 10) + delta;
      if (opt_negate) {
        at = -at;
      }
    } else {
      // If the index is dynamic, adjust it in code.
      if (delta > 0) {
        at = 'int(' + at + ' + ' + delta + ')';
      } else if (delta < 0) {
        at = 'int(' + at + ' - ' + -delta + ')';
      } else {
        at = 'int(' + at + ')';
      }
      if (opt_negate) {
        at = '-' + at;
      }
    }
    return at;
  }
}
