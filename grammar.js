/**
 * @file Mojo grammar for tree-sitter
 * @author Max Brunsfeld <maxbrunsfeld@gmail.com>
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

const PREC = {
  // this resolves a conflict between the usage of ':' in a lambda vs in a
  // typed parameter. In the case of a lambda, we don't allow typed parameters.
  lambda: -2,
  typed_parameter: -1,
  conditional: -1,

  parenthesized_expression: 1,
  parenthesized_list_splat: 1,
  or: 10,
  and: 11,
  not: 12,
  compare: 13,
  bitwise_or: 14,
  bitwise_and: 15,
  xor: 16,
  shift: 17,
  plus: 18,
  times: 19,
  unary: 20,
  power: 21,
  call: 22,
};

const SEMICOLON = ";";

module.exports = grammar({
  name: "mojo",

  extras: ($) => [
    $.comment,
    /[\s\f\uFEFF\u2060\u200B]|\r?\n/,
    $.line_continuation,
  ],

  conflicts: ($) => [
    [$.primary_expression, $.pattern],
    [$.primary_expression, $.list_splat_pattern],
    [$.tuple, $.tuple_pattern],
    [$.list, $.list_pattern],
    [$.with_item, $._collection_elements],
    [$.named_expression, $.as_pattern],
    [$.print_statement, $.primary_expression],
    [$.type_alias_statement, $.primary_expression],
    [$.match_statement, $.primary_expression],
    [$.struct_literal, $._collection_elements],
  ],

  supertypes: ($) => [
    $._simple_statement,
    $._compound_statement,
    $.expression_statement,
    $.expression,
    $.primary_expression,
    $.pattern,
    $.parameter,
  ],

  externals: ($) => [
    $._newline,
    $._indent,
    $._dedent,
    $.string_start,
    $._string_content,
    $.escape_interpolation,
    $.string_end,

    // Mark comments as external tokens so that the external scanner is always
    // invoked, even if no external token is expected. This allows for better
    // error recovery, because the external scanner can maintain the overall
    // structure by returning dedent tokens whenever a dedent occurs, even
    // if no dedent is expected.
    $.comment,

    // Allow the external scanner to check for the validity of closing brackets
    // so that it can avoid returning dedent tokens between brackets.
    "]",
    ")",
    "}",
    "except",
  ],

  inline: ($) => [
    $._simple_statement,
    $._compound_statement,
    $._suite,
    $._expressions,
    $._left_hand_side,
    $.keyword_identifier,
  ],

  reserved: {
    global: (_) => [
      // Python keywords (kept for compatibility)
      "False",
      "await",
      "else",
      "import",
      "pass",
      "None",
      "break",
      "except",
      "in",
      "raise",
      "True",
      "class",
      "finally",
      "is",
      "return",
      "and",
      "continue",
      "for",
      "lambda",
      "try",
      "as",
      "def",
      "from",
      "nonlocal",
      "while",
      "assert",
      "del",
      "global",
      "not",
      "with",
      "async",
      "elif",
      "if",
      "or",
      "yield",
      // Mojo keywords
      "fn",
      "struct",
      "trait",
      "var",
      "comptime",
      "raises",
      "mut",
      "read",
      "ref",
      "out",
      "deinit",
      "capturing",
      "unified",
      "Self",
    ],
  },

  word: ($) => $.identifier,

  rules: {
    module: ($) => repeat($._statement),

    _statement: ($) => choice($._simple_statements, $._compound_statement),

    // Simple statements

    _simple_statements: ($) =>
      seq(
        sep1($._simple_statement, SEMICOLON),
        optional(SEMICOLON),
        $._newline,
      ),

    _simple_statement: ($) =>
      choice(
        $.future_import_statement,
        $.import_statement,
        $.import_from_statement,
        $.print_statement,
        $.assert_statement,
        $.expression_statement,
        $.return_statement,
        $.delete_statement,
        $.raise_statement,
        $.pass_statement,
        $.break_statement,
        $.continue_statement,
        $.global_statement,
        $.nonlocal_statement,
        $.exec_statement,
        $.type_alias_statement,
        $.var_statement,
        $.ref_statement,
        $.comptime_declaration,
        $.comptime_assert_statement,
      ),

    import_statement: ($) => seq("import", $._import_list),

    import_prefix: (_) => repeat1("."),

    relative_import: ($) => seq($.import_prefix, optional($.dotted_name)),

    future_import_statement: ($) =>
      seq(
        "from",
        "__future__",
        "import",
        choice($._import_list, seq("(", $._import_list, ")")),
      ),

    import_from_statement: ($) =>
      seq(
        "from",
        field("module_name", choice($.relative_import, $.dotted_name)),
        "import",
        choice(
          $.wildcard_import,
          $._import_list,
          seq("(", $._import_list, ")"),
        ),
      ),

    _import_list: ($) =>
      seq(
        commaSep1(
          field(
            "name",
            choice($.relative_import, $.dotted_name, $.aliased_import),
          ),
        ),
        optional(","),
      ),

    aliased_import: ($) =>
      seq(field("name", $.dotted_name), "as", field("alias", $.identifier)),

    wildcard_import: (_) => "*",

    print_statement: ($) =>
      choice(
        prec(
          1,
          seq(
            "print",
            $.chevron,
            repeat(seq(",", field("argument", $.expression))),
            optional(","),
          ),
        ),
        prec(
          -3,
          prec.dynamic(
            -1,
            seq(
              "print",
              commaSep1(field("argument", $.expression)),
              optional(","),
            ),
          ),
        ),
      ),

    chevron: ($) => seq(">>", $.expression),

    assert_statement: ($) => seq("assert", commaSep1($.expression)),

    expression_statement: ($) =>
      choice(
        $.expression,
        $.tuple_expression,
        $.assignment,
        $.augmented_assignment,
        $.yield,
      ),

    tuple_expression: ($) =>
      seq(
        $.expression,
        ",",
        optional(seq(commaSep1($.expression), optional(","))),
      ),

    named_expression: ($) =>
      seq(
        field("name", $._named_expression_lhs),
        ":=",
        field("value", $.expression),
      ),

    _named_expression_lhs: ($) => choice($.identifier, $.keyword_identifier),

    return_statement: ($) => seq("return", optional($._expressions)),

    delete_statement: ($) => seq("del", $._expressions),

    _expressions: ($) => choice($.expression, $.expression_list),

    raise_statement: ($) =>
      seq(
        "raise",
        optional($._expressions),
        optional(seq("from", field("cause", $.expression))),
      ),

    pass_statement: (_) => prec.left("pass"),
    break_statement: (_) => prec.left("break"),
    continue_statement: (_) => prec.left("continue"),

    // Compound statements

    _compound_statement: ($) =>
      choice(
        $.if_statement,
        $.for_statement,
        $.while_statement,
        $.try_statement,
        $.with_statement,
        $.function_definition,
        $.class_definition,
        $.struct_definition,
        $.trait_definition,
        $.extension_definition,
        $.mlir_region_statement,
        $.decorated_definition,
        $.match_statement,
        $.comptime_if_statement,
        $.comptime_for_statement,
      ),

    if_statement: ($) =>
      seq(
        "if",
        field("condition", $.expression),
        ":",
        field("consequence", $._suite),
        repeat(field("alternative", $.elif_clause)),
        optional(field("alternative", $.else_clause)),
      ),

    elif_clause: ($) =>
      seq(
        "elif",
        field("condition", $.expression),
        ":",
        field("consequence", $._suite),
      ),

    else_clause: ($) => seq("else", ":", field("body", $._suite)),

    match_statement: ($) =>
      seq(
        "match",
        commaSep1(field("subject", $.expression)),
        optional(","),
        ":",
        field("body", alias($._match_block, $.block)),
      ),

    _match_block: ($) =>
      choice(
        seq($._indent, repeat(field("alternative", $.case_clause)), $._dedent),
        $._newline,
      ),

    case_clause: ($) =>
      seq(
        "case",
        commaSep1($.case_pattern),
        optional(","),
        optional(field("guard", $.if_clause)),
        ":",
        field("consequence", $._suite),
      ),

    for_statement: ($) =>
      seq(
        optional("async"),
        "for",
        optional(choice("var", "ref")),
        field("left", $._left_hand_side),
        "in",
        field("right", $._expressions),
        ":",
        field("body", $._suite),
        field("alternative", optional($.else_clause)),
      ),

    while_statement: ($) =>
      seq(
        "while",
        field("condition", $.expression),
        ":",
        field("body", $._suite),
        optional(field("alternative", $.else_clause)),
      ),

    try_statement: ($) =>
      seq(
        "try",
        ":",
        field("body", $._suite),
        repeat($.except_clause),
        optional($.else_clause),
        optional($.finally_clause),
      ),

    except_clause: ($) =>
      seq(
        "except",
        optional(token(prec(1, "*"))),
        optional(
          choice(
            seq(
              field("value", $.expression),
              optional(seq("as", field("alias", $.expression))),
            ),
            commaSep1(field("value", $.expression)),
          ),
        ),
        ":",
        $._suite,
      ),

    finally_clause: ($) => seq("finally", ":", $._suite),

    with_statement: ($) =>
      seq(
        optional("async"),
        "with",
        $.with_clause,
        ":",
        field("body", $._suite),
      ),

    with_clause: ($) =>
      choice(
        seq(commaSep1($.with_item), optional(",")),
        seq("(", commaSep1($.with_item), optional(","), ")"),
      ),

    with_item: ($) => prec.dynamic(1, seq(field("value", $.expression))),

    function_definition: ($) =>
      seq(
        optional("async"),
        choice("def", "fn"),
        field("name", choice($.identifier, $.keyword_identifier)),
        field("type_parameters", optional($.type_parameter)),
        field("parameters", $.parameters),
        optional(field("raises", $.raises_clause)),
        optional(field("capturing", $.capturing_clause)),
        optional(field("unified", $.unified_clause)),
        optional(seq("->", field("return_type", $.type))),
        optional(field("where", $.where_clause)),
        ":",
        field("body", $._suite),
      ),

    where_clause: ($) => seq("where", commaSep1($.expression)),

    raises_clause: ($) =>
      prec.right(1, seq("raises", optional(field("type", $.type)))),

    parameters: ($) => seq("(", optional($._parameters), ")"),

    lambda_parameters: ($) => $._parameters,

    list_splat: ($) => seq("*", $.expression),

    dictionary_splat: ($) => seq("**", $.expression),

    global_statement: ($) => seq("global", commaSep1($.identifier)),

    nonlocal_statement: ($) => seq("nonlocal", commaSep1($.identifier)),

    exec_statement: ($) =>
      seq(
        "exec",
        field("code", choice($.string, $.identifier)),
        optional(seq("in", commaSep1($.expression))),
      ),

    type_alias_statement: ($) =>
      prec.dynamic(
        1,
        seq("type", field("left", $.type), "=", field("right", $.type)),
      ),

    // Mojo var statement: var x: Int = 42
    // Also: var x, y, z = expr (tuple unpacking)
    var_statement: ($) =>
      seq(
        "var",
        field(
          "name",
          choice(
            $.identifier,
            $.keyword_identifier,
            $.string,
            $.tuple_pattern,
            $.pattern_list,
          ),
        ),
        optional(seq(":", field("type", $.type))),
        optional(seq("=", field("value", $._right_hand_side))),
      ),

    // Mojo ref binding: ref name = expr
    ref_statement: ($) =>
      seq(
        "ref",
        field("name", choice($.identifier, $.tuple_pattern, $.pattern_list)),
        optional(seq(":", field("type", $.type))),
        "=",
        field("value", $._right_hand_side),
      ),

    // Mojo comptime declaration: comptime MY_CONST = 42
    // Also: comptime AssociatedType: Constraint = ConcreteType
    // Also: comptime IteratorType[mut: Bool, //, origin: Origin[mut=mut]]: Iterator = Self
    // Also: comptime MyFunc = fn[T: Trait](Int) -> None
    // Also: comptime `A` = Byte(ord("A")) (backtick-delimited names)
    comptime_declaration: ($) =>
      seq(
        "comptime",
        field("name", choice($.identifier, $.string)),
        field("type_parameters", optional($.type_parameter)),
        optional(seq(":", field("type", $.type))),
        optional(seq("=", field("value", $._right_hand_side))),
      ),

    // comptime assert: comptime assert condition, "message"
    comptime_assert_statement: ($) =>
      seq("comptime", "assert", commaSep1($.expression)),

    // comptime if: comptime if condition: ...
    comptime_if_statement: ($) =>
      seq(
        "comptime",
        "if",
        field("condition", $.expression),
        ":",
        field("consequence", $._suite),
        repeat(field("alternative", $.elif_clause)),
        optional(field("alternative", $.else_clause)),
      ),

    // comptime for: comptime for i in range(...): ...
    comptime_for_statement: ($) =>
      seq(
        "comptime",
        "for",
        field("left", $._left_hand_side),
        "in",
        field("right", $._expressions),
        ":",
        field("body", $._suite),
        field("alternative", optional($.else_clause)),
      ),

    // Mojo __mlir_region: __mlir_region name(params):
    mlir_region_statement: ($) =>
      seq(
        "__mlir_region",
        field("name", $.identifier),
        field("parameters", $.parameters),
        ":",
        field("body", $._suite),
      ),

    class_definition: ($) =>
      seq(
        "class",
        field("name", $.identifier),
        field("type_parameters", optional($.type_parameter)),
        field("superclasses", optional($.argument_list)),
        ":",
        field("body", $._suite),
      ),

    // Mojo extension: __extension Type:
    extension_definition: ($) =>
      seq("__extension", field("name", $.type), ":", field("body", $._suite)),

    struct_definition: ($) =>
      seq(
        "struct",
        field("name", $.identifier),
        field("type_parameters", optional($.type_parameter)),
        field("traits", optional($.trait_list)),
        ":",
        field("body", $._suite),
      ),

    trait_definition: ($) =>
      seq(
        "trait",
        field("name", $.identifier),
        field("type_parameters", optional($.type_parameter)),
        field("traits", optional($.trait_list)),
        ":",
        field("body", $._suite),
      ),

    trait_list: ($) => seq("(", commaSep1($.type), optional(","), ")"),

    type_parameter: ($) =>
      seq(
        "[",
        commaSep1(
          choice(
            $.type_parameter_item,
            $.parameter_separator,
            $.positional_separator,
            $.keyword_separator,
          ),
        ),
        optional(","),
        "]",
      ),

    // Items inside [...] parameter lists, supporting defaults: T: Trait = Default
    // Default uses expression so func[args]() parses as call(subscript), not generic_type
    // Also supports where constraints: start: Int where start >= 0 = 0
    type_parameter_item: ($) =>
      seq(
        $.type,
        optional(seq("where", field("where", $.expression))),
        optional(seq("=", field("default", $.expression))),
      ),

    parameter_separator: (_) => "//",

    parenthesized_list_splat: ($) =>
      prec(
        PREC.parenthesized_list_splat,
        seq(
          "(",
          choice(
            alias($.parenthesized_list_splat, $.parenthesized_expression),
            $.list_splat,
          ),
          ")",
        ),
      ),

    argument_list: ($) =>
      seq(
        "(",
        optional(
          commaSep1(
            choice(
              $.expression,
              $.list_splat,
              $.dictionary_splat,
              alias($.parenthesized_list_splat, $.parenthesized_expression),
              $.keyword_argument,
            ),
          ),
        ),
        optional(","),
        ")",
      ),

    decorated_definition: ($) =>
      seq(
        repeat1($.decorator),
        field(
          "definition",
          choice(
            $.class_definition,
            $.struct_definition,
            $.trait_definition,
            $.function_definition,
          ),
        ),
      ),

    decorator: ($) => seq("@", $.expression, $._newline),

    _suite: ($) =>
      choice(
        alias($._simple_statements, $.block),
        seq($._indent, $.block),
        alias($._newline, $.block),
      ),

    block: ($) => seq(repeat($._statement), $._dedent),

    expression_list: ($) =>
      prec.right(
        seq(
          $.expression,
          choice(",", seq(repeat1(seq(",", $.expression)), optional(","))),
        ),
      ),

    dotted_name: ($) => prec(1, sep1($.identifier, ".")),

    // Match cases

    case_pattern: ($) =>
      prec(
        1,
        choice(
          alias($._as_pattern, $.as_pattern),
          $.keyword_pattern,
          $._simple_pattern,
        ),
      ),

    _simple_pattern: ($) =>
      prec(
        1,
        choice(
          $.class_pattern,
          $.splat_pattern,
          $.union_pattern,
          alias($._list_pattern, $.list_pattern),
          alias($._tuple_pattern, $.tuple_pattern),
          $.dict_pattern,
          $.string,
          $.concatenated_string,
          $.true,
          $.false,
          $.none,
          seq(optional("-"), choice($.integer, $.float)),
          $.complex_pattern,
          $.dotted_name,
          "_",
        ),
      ),

    _as_pattern: ($) => seq($.case_pattern, "as", $.identifier),

    union_pattern: ($) =>
      prec.right(
        seq($._simple_pattern, repeat1(prec.left(seq("|", $._simple_pattern)))),
      ),

    _list_pattern: ($) =>
      seq("[", optional(seq(commaSep1($.case_pattern), optional(","))), "]"),

    _tuple_pattern: ($) =>
      seq("(", optional(seq(commaSep1($.case_pattern), optional(","))), ")"),

    dict_pattern: ($) =>
      seq(
        "{",
        optional(
          seq(
            commaSep1(choice($._key_value_pattern, $.splat_pattern)),
            optional(","),
          ),
        ),
        "}",
      ),

    _key_value_pattern: ($) =>
      seq(field("key", $._simple_pattern), ":", field("value", $.case_pattern)),

    keyword_pattern: ($) => seq($.identifier, "=", $._simple_pattern),

    splat_pattern: ($) =>
      prec(1, seq(choice("*", "**"), choice($.identifier, "_"))),

    class_pattern: ($) =>
      seq(
        $.dotted_name,
        "(",
        optional(seq(commaSep1($.case_pattern), optional(","))),
        ")",
      ),

    complex_pattern: ($) =>
      prec(
        1,
        seq(
          optional("-"),
          choice($.integer, $.float),
          choice("+", "-"),
          choice($.integer, $.float),
        ),
      ),

    // Patterns

    _parameters: ($) => seq(commaSep1($.parameter), optional(",")),

    _patterns: ($) => seq(commaSep1($.pattern), optional(",")),

    parameter: ($) =>
      choice(
        $.identifier,
        $.typed_parameter,
        $.default_parameter,
        $.typed_default_parameter,
        $.list_splat_pattern,
        $.tuple_pattern,
        $.keyword_separator,
        $.positional_separator,
        $.dictionary_splat_pattern,
        $.parameter_modifier_parameter,
      ),

    _parameter_modifier: ($) =>
      choice(
        "mut",
        "read",
        seq("ref", optional($.type_parameter)),
        "out",
        "deinit",
        "var",
      ),

    // e.g. `mut self`, `ref self`, `out self`, `deinit self`, `ref[origin] self`
    parameter_modifier_parameter: ($) =>
      seq(
        field("modifier", $._parameter_modifier),
        choice(
          $.identifier,
          $.typed_parameter,
          $.default_parameter,
          $.typed_default_parameter,
          $.list_splat_pattern,
          $.dictionary_splat_pattern,
        ),
      ),

    pattern: ($) =>
      choice(
        $.identifier,
        $.keyword_identifier,
        $.subscript,
        $.attribute,
        $.call,
        $.list_splat_pattern,
        $.tuple_pattern,
        $.list_pattern,
        $.modifier_pattern,
      ),

    // ref x, var x, mut x in pattern positions (e.g., count, ref name = ...)
    modifier_pattern: ($) =>
      prec(
        1,
        seq(
          field("modifier", choice("ref", "var", "mut")),
          field("name", $.identifier),
        ),
      ),

    tuple_pattern: ($) => seq("(", optional($._patterns), ")"),

    list_pattern: ($) => seq("[", optional($._patterns), "]"),

    default_parameter: ($) =>
      seq(
        field("name", choice($.identifier, $.tuple_pattern)),
        "=",
        field("value", $.expression),
      ),

    typed_default_parameter: ($) =>
      prec(
        PREC.typed_parameter,
        seq(
          field("name", $.identifier),
          ":",
          field("type", $.type),
          "=",
          field("value", $.expression),
        ),
      ),

    list_splat_pattern: ($) =>
      seq(
        "*",
        choice($.identifier, $.keyword_identifier, $.subscript, $.attribute),
      ),

    dictionary_splat_pattern: ($) =>
      seq(
        "**",
        choice($.identifier, $.keyword_identifier, $.subscript, $.attribute),
      ),

    // Extended patterns (patterns allowed in match statement are far more flexible than simple patterns though still a subset of "expression")

    as_pattern: ($) =>
      prec.left(
        seq(
          $.expression,
          "as",
          field("alias", alias($.expression, $.as_pattern_target)),
        ),
      ),

    // Expressions

    _expression_within_for_in_clause: ($) =>
      choice($.expression, alias($.lambda_within_for_in_clause, $.lambda)),

    expression: ($) =>
      choice(
        $.comparison_operator,
        $.not_operator,
        $.boolean_operator,
        $.lambda,
        $.primary_expression,
        $.conditional_expression,
        $.named_expression,
        $.as_pattern,
      ),

    primary_expression: ($) =>
      choice(
        $.await,
        $.binary_operator,
        $.identifier,
        $.keyword_identifier,
        $.string,
        $.concatenated_string,
        $.integer,
        $.float,
        $.true,
        $.false,
        $.none,
        $.unary_operator,
        $.attribute,
        $.subscript,
        $.call,
        $.list,
        $.list_comprehension,
        $.dictionary,
        $.dictionary_comprehension,
        $.set,
        $.set_comprehension,
        $.tuple,
        $.parenthesized_expression,
        $.generator_expression,
        $.ellipsis,
        alias($.list_splat_pattern, $.list_splat),
        $.transfer_expression,
        $.self_type,
        $.struct_literal,
        $.function_type,
      ),

    // Mojo transfer operator: value^
    transfer_expression: ($) =>
      prec.left(
        PREC.call + 1,
        seq(field("value", $.primary_expression), token.immediate("^")),
      ),

    not_operator: ($) =>
      prec(PREC.not, seq("not", field("argument", $.expression))),

    boolean_operator: ($) =>
      choice(
        prec.left(
          PREC.and,
          seq(
            field("left", $.expression),
            field("operator", "and"),
            field("right", $.expression),
          ),
        ),
        prec.left(
          PREC.or,
          seq(
            field("left", $.expression),
            field("operator", "or"),
            field("right", $.expression),
          ),
        ),
      ),

    binary_operator: ($) => {
      const table = [
        [prec.left, "+", PREC.plus],
        [prec.left, "-", PREC.plus],
        [prec.left, "*", PREC.times],
        [prec.left, "@", PREC.times],
        [prec.left, "/", PREC.times],
        [prec.left, "%", PREC.times],
        [prec.left, "//", PREC.times],
        [prec.right, "**", PREC.power],
        [prec.left, "|", PREC.bitwise_or],
        [prec.left, "&", PREC.bitwise_and],
        [prec.left, "^", PREC.xor],
        [prec.left, "<<", PREC.shift],
        [prec.left, ">>", PREC.shift],
      ];

      // @ts-ignore
      return choice(
        ...table.map(([fn, operator, precedence]) =>
          fn(
            precedence,
            seq(
              field("left", $.primary_expression),
              // @ts-ignore
              field("operator", operator),
              field("right", $.primary_expression),
            ),
          ),
        ),
      );
    },

    unary_operator: ($) =>
      prec(
        PREC.unary,
        seq(
          field("operator", choice("+", "-", "~")),
          field("argument", $.primary_expression),
        ),
      ),

    _not_in: (_) => seq("not", "in"),

    _is_not: (_) => seq("is", "not"),

    comparison_operator: ($) =>
      prec.left(
        PREC.compare,
        seq(
          $.primary_expression,
          repeat1(
            seq(
              field(
                "operators",
                choice(
                  "<",
                  "<=",
                  "==",
                  "!=",
                  ">=",
                  ">",
                  "<>",
                  "in",
                  alias($._not_in, "not in"),
                  "is",
                  alias($._is_not, "is not"),
                ),
              ),
              $.primary_expression,
            ),
          ),
        ),
      ),

    lambda: ($) =>
      prec(
        PREC.lambda,
        seq(
          "lambda",
          field("parameters", optional($.lambda_parameters)),
          ":",
          field("body", $.expression),
        ),
      ),

    lambda_within_for_in_clause: ($) =>
      seq(
        "lambda",
        field("parameters", optional($.lambda_parameters)),
        ":",
        field("body", $._expression_within_for_in_clause),
      ),

    assignment: ($) =>
      seq(
        field("left", $._left_hand_side),
        choice(
          seq("=", field("right", $._right_hand_side)),
          seq(":", field("type", $.type)),
          seq(
            ":",
            field("type", $.type),
            "=",
            field("right", $._right_hand_side),
          ),
        ),
      ),

    augmented_assignment: ($) =>
      seq(
        field("left", $._left_hand_side),
        field(
          "operator",
          choice(
            "+=",
            "-=",
            "*=",
            "/=",
            "@=",
            "//=",
            "%=",
            "**=",
            ">>=",
            "<<=",
            "&=",
            "^=",
            "|=",
          ),
        ),
        field("right", $._right_hand_side),
      ),

    _left_hand_side: ($) => choice($.pattern, $.pattern_list),

    pattern_list: ($) =>
      seq(
        $.pattern,
        choice(",", seq(repeat1(seq(",", $.pattern)), optional(","))),
      ),

    _right_hand_side: ($) =>
      choice(
        $.expression,
        $.expression_list,
        $.assignment,
        $.augmented_assignment,
        $.pattern_list,
        $.yield,
      ),

    yield: ($) =>
      prec.right(
        seq(
          "yield",
          choice(seq("from", $.expression), optional($._expressions)),
        ),
      ),

    attribute: ($) =>
      prec(
        PREC.call,
        seq(
          field("object", $.primary_expression),
          ".",
          field(
            "attribute",
            choice($.identifier, $.keyword_identifier, $.string),
          ),
        ),
      ),

    subscript: ($) =>
      prec(
        PREC.call,
        seq(
          field("value", $.primary_expression),
          "[",
          optional(
            seq(
              commaSep1(
                field(
                  "subscript",
                  choice($.expression, $.slice, $.keyword_argument),
                ),
              ),
              optional(","),
            ),
          ),
          "]",
        ),
      ),

    slice: ($) =>
      seq(
        optional($.expression),
        ":",
        optional($.expression),
        optional(seq(":", optional($.expression))),
      ),

    ellipsis: (_) => "...",

    // Mojo struct literal: {key = value, key2 = value2}
    // Can also have positional args: {ctx, key = value}
    // Must have at least one key=value pair to distinguish from set
    struct_literal: ($) =>
      prec(
        1,
        seq(
          "{",
          commaSep1(choice($.keyword_argument, $.expression)),
          optional(","),
          "}",
        ),
      ),

    call: ($) =>
      prec(
        PREC.call,
        seq(
          field("function", $.primary_expression),
          field("arguments", choice($.generator_expression, $.argument_list)),
        ),
      ),

    typed_parameter: ($) =>
      prec(
        PREC.typed_parameter,
        seq(
          choice(
            $.identifier,
            $.list_splat_pattern,
            $.dictionary_splat_pattern,
          ),
          ":",
          field("type", $.type),
        ),
      ),

    type: ($) =>
      choice(
        prec(1, $.expression),
        $.splat_type,
        $.union_type,
        $.constrained_type,
        $.member_type,
        $.ref_type,
        $.trait_bound_type,
      ),
    splat_type: ($) => prec(1, seq(choice("*", "**"), $.identifier)),
    union_type: ($) => prec.left(seq($.type, "|", $.type)),
    constrained_type: ($) => prec.right(seq($.type, ":", $.type)),
    member_type: ($) => seq($.type, ".", $.identifier),

    // Mojo function type: fn(Int) -> Int, fn(Int) raises capturing[_] -> Bool
    // Function types have anonymous parameters (just types), not named parameters
    function_type: ($) =>
      prec.right(
        1,
        seq(
          "fn",
          field("type_parameters", optional($.type_parameter)),
          field("parameters", $.function_type_parameters),
          // raises, capturing, unified can appear in any order
          repeat(
            choice(
              field("raises", $.raises_clause),
              field("capturing", $.capturing_clause),
              field("unified", $.unified_clause),
            ),
          ),
          optional(seq("->", field("return_type", $.type))),
        ),
      ),

    // Parameters in function types: fn(Int, mut Some[Writer])
    // These are anonymous — just types with optional modifiers
    function_type_parameters: ($) =>
      seq(
        "(",
        optional(
          commaSep1(
            choice(
              seq(optional($._parameter_modifier), $.type),
              $.keyword_separator,
              $.positional_separator,
              $.parameter_separator,
            ),
          ),
        ),
        ")",
      ),

    // Mojo capturing clause: capturing, capturing[_], capturing[origins]
    capturing_clause: ($) =>
      prec.right(seq("capturing", optional($.type_parameter))),

    // Mojo unified closure type: unified, unified {}, unified {mut x, read y}
    unified_clause: ($) =>
      seq(
        "unified",
        optional(
          seq(
            "{",
            optional(
              commaSep1(
                seq(
                  optional(choice("mut", "read", "ref", "out", "var")),
                  optional($.identifier),
                ),
              ),
            ),
            "}",
          ),
        ),
      ),

    // Mojo ref type with origin and optional address space: ref[origin], ref[origin, AddressSpace.GENERIC]
    ref_type: ($) =>
      prec.right(1, seq("ref", "[", commaSep1($.type), "]", optional($.type))),

    // Mojo trait bound: T: Movable & Copyable & Hashable
    trait_bound_type: ($) => prec.left(2, seq($.type, "&", $.type)),

    keyword_argument: ($) =>
      seq(
        field("name", choice($.identifier, $.keyword_identifier)),
        "=",
        field("value", $.expression),
      ),

    // Literals

    list: ($) => seq("[", optional($._collection_elements), "]"),

    set: ($) => seq("{", $._collection_elements, "}"),

    tuple: ($) => seq("(", optional($._collection_elements), ")"),

    dictionary: ($) =>
      seq(
        "{",
        optional(commaSep1(choice($.pair, $.dictionary_splat))),
        optional(","),
        "}",
      ),

    pair: ($) =>
      seq(field("key", $.expression), ":", field("value", $.expression)),

    list_comprehension: ($) =>
      seq("[", field("body", $.expression), $._comprehension_clauses, "]"),

    dictionary_comprehension: ($) =>
      seq("{", field("body", $.pair), $._comprehension_clauses, "}"),

    set_comprehension: ($) =>
      seq("{", field("body", $.expression), $._comprehension_clauses, "}"),

    generator_expression: ($) =>
      seq("(", field("body", $.expression), $._comprehension_clauses, ")"),

    _comprehension_clauses: ($) =>
      seq($.for_in_clause, repeat(choice($.for_in_clause, $.if_clause))),

    parenthesized_expression: ($) =>
      prec(
        PREC.parenthesized_expression,
        seq("(", choice($.expression, $.yield), ")"),
      ),

    _collection_elements: ($) =>
      seq(
        commaSep1(
          choice(
            $.expression,
            $.yield,
            $.list_splat,
            $.parenthesized_list_splat,
          ),
        ),
        optional(","),
      ),

    for_in_clause: ($) =>
      prec.left(
        seq(
          optional("async"),
          "for",
          field("left", $._left_hand_side),
          "in",
          field("right", commaSep1($._expression_within_for_in_clause)),
          optional(","),
        ),
      ),

    if_clause: ($) => seq("if", $.expression),

    conditional_expression: ($) =>
      prec.right(
        PREC.conditional,
        seq($.expression, "if", $.expression, "else", $.expression),
      ),

    concatenated_string: ($) => seq($.string, repeat1($.string)),

    string: ($) =>
      seq(
        $.string_start,
        repeat(choice($.interpolation, $.string_content)),
        $.string_end,
      ),

    string_content: ($) =>
      prec.right(
        repeat1(
          choice(
            $.escape_interpolation,
            $.escape_sequence,
            $._not_escape_sequence,
            $._string_content,
          ),
        ),
      ),

    interpolation: ($) =>
      seq(
        "{",
        field("expression", $._f_expression),
        optional("="),
        optional(field("type_conversion", $.type_conversion)),
        optional(field("format_specifier", $.format_specifier)),
        "}",
      ),

    _f_expression: ($) =>
      choice($.expression, $.expression_list, $.pattern_list, $.yield),

    escape_sequence: (_) =>
      token.immediate(
        prec(
          1,
          seq(
            "\\",
            choice(
              /u[a-fA-F\d]{4}/,
              /U[a-fA-F\d]{8}/,
              /x[a-fA-F\d]{2}/,
              /\d{1,3}/,
              /\r?\n/,
              /['"abfrntv\\]/,
              /N\{[^}]+\}/,
            ),
          ),
        ),
      ),

    _not_escape_sequence: (_) => token.immediate("\\"),

    format_specifier: ($) =>
      seq(
        ":",
        repeat(
          choice(
            token(prec(1, /[^{}\n]+/)),
            alias($.interpolation, $.format_expression),
          ),
        ),
      ),

    type_conversion: (_) => /![a-z]/,

    integer: (_) =>
      token(
        choice(
          seq(choice("0x", "0X"), repeat1(/_?[A-Fa-f0-9]+/), optional(/[Ll]/)),
          seq(choice("0o", "0O"), repeat1(/_?[0-7]+/), optional(/[Ll]/)),
          seq(choice("0b", "0B"), repeat1(/_?[0-1]+/), optional(/[Ll]/)),
          seq(
            repeat1(/[0-9]+_?/),
            choice(
              optional(/[Ll]/), // long numbers
              optional(/[jJ]/), // complex numbers
            ),
          ),
        ),
      ),

    float: (_) => {
      const digits = repeat1(/[0-9]+_?/);
      const exponent = seq(/[eE][\+-]?/, digits);

      return token(
        seq(
          choice(
            seq(digits, ".", optional(digits), optional(exponent)),
            seq(optional(digits), ".", digits, optional(exponent)),
            seq(digits, exponent),
          ),
          optional(/[jJ]/),
        ),
      );
    },

    identifier: (_) => /[_\p{XID_Start}][_\p{XID_Continue}]*/,

    keyword_identifier: ($) =>
      choice(
        prec(
          -3,
          alias(
            choice(
              "print",
              "exec",
              "async",
              "await",
              "mut",
              "read",
              "ref",
              "out",
              "var",
              "capturing",
              "raises",
            ),
            $.identifier,
          ),
        ),
        alias(choice("type", "match"), $.identifier),
      ),

    self_type: (_) => "Self",

    true: (_) => "True",
    false: (_) => "False",
    none: (_) => "None",

    await: ($) => prec(PREC.unary, seq("await", $.primary_expression)),

    comment: (_) => token(seq("#", /.*/)),

    line_continuation: (_) =>
      token(seq("\\", choice(seq(optional("\r"), "\n"), "\0"))),

    positional_separator: (_) => "/",
    keyword_separator: (_) => "*",
  },
});

module.exports.PREC = PREC;

/**
 * Creates a rule to match one or more of the rules separated by a comma
 *
 * @param {RuleOrLiteral} rule
 *
 * @returns {SeqRule}
 */
function commaSep1(rule) {
  return sep1(rule, ",");
}

/**
 * Creates a rule to match one or more occurrences of `rule` separated by `sep`
 *
 * @param {RuleOrLiteral} rule
 *
 * @param {RuleOrLiteral} separator
 *
 * @returns {SeqRule}
 */
function sep1(rule, separator) {
  return seq(rule, repeat(seq(separator, rule)));
}
