-- rmh/json.lua (WS3): the mailbox codec. Round trips, unicode, numbers (PLAN §0.9:
-- %.17g; non-finite numbers never reach JSON — scores travel as "inf" strings),
-- nesting, null handling and the strict-syntax error cases.

local J = require 'rmh/json'

local function rt(v) return J.decode(J.encode(v)) end

describe('json encode', function()
  it('encodes scalars', function()
    expect(J.encode(true)).eq('true')
    expect(J.encode(false)).eq('false')
    expect(J.encode(nil)).eq('null')
    expect(J.encode(J.null)).eq('null')
    expect(J.encode('hi')).eq('"hi"')
    expect(J.encode(0)).eq('0')
    expect(J.encode(-3)).eq('-3')
  end)

  it('sorts object keys so output is deterministic', function()
    expect(J.encode({ b = 1, a = 2, c = { z = 1, y = 2 } })).eq('{"a":2,"b":1,"c":{"y":2,"z":1}}')
  end)

  it('encodes arrays, and empty tables as {} unless marked', function()
    expect(J.encode({ 1, 2, 3 })).eq('[1,2,3]')
    expect(J.encode({})).eq('{}')
    expect(J.encode(J.array())).eq('[]')
    expect(J.encode({ a = J.array() })).eq('{"a":[]}')
    expect(J.encode({ 1, J.null, 3 })).eq('[1,null,3]')
  end)

  it('escapes quotes, backslashes and control characters', function()
    expect(J.encode('a"b\\c\n\r\t\b\f')).eq('"a\\"b\\\\c\\n\\r\\t\\b\\f"')
    expect(J.encode('\0\1\31\127')).eq('"\\u0000\\u0001\\u001f\\u007f"')
    expect(J.encode('/')).eq('"/"')
  end)

  it('never puts a raw newline in a line', function()
    local s = J.encode({ text = 'line1\nline2', list = { 'x\ny' } })
    expect(s:find('\n', 1, true)).eq(nil)
  end)

  it('passes UTF-8 through unchanged', function()
    local s = 'é漢😀'
    expect(J.encode(s)).eq('"' .. s .. '"')
  end)

  it('writes numbers as %.17g so every double round-trips exactly', function()
    expect(J.encode(0.1)).eq('0.10000000000000001')
    for _, x in ipairs({ 0.1, 1 / 3, 2 ^ 53, 2 ^ 53 + 2, -2 ^ 63, 1e308, 5e-324, 2.2250738585072014e-308, 123456789.123 }) do
      expect(rt(x)).eq(x)
    end
    expect(J.encode(1e300)).eq('1.0000000000000001e+300')
  end)

  it('keeps negative zero', function()
    local z = rt(-0.0)
    expect(z).eq(0)
    expect(1 / z).eq(-math.huge)
  end)

  it('refuses inf, -inf and nan (scores travel as strings, §0.9)', function()
    expect(function() J.encode(math.huge) end).error('non-finite')
    expect(function() J.encode(-math.huge) end).error('non-finite')
    expect(function() J.encode({ score = 0 / 0 }) end).error('non-finite')
  end)

  it('refuses cycles, sparse and mixed tables, bad keys and functions', function()
    local t = {}
    t.self = t
    expect(function() J.encode(t) end).error('cycle')
    expect(function() J.encode({ [1] = 1, [3] = 3 }) end).error('sparse')
    expect(function() J.encode({ 1, a = 2 }) end).error('mixed')
    expect(function() J.encode({ [1.5] = 1 }) end).error('bad key')
    expect(function() J.encode({ [true] = 1 }) end).error('bad key')
    expect(function() J.encode(print) end).error('cannot encode function')
  end)

  it('allows the same table twice when it is not a cycle', function()
    local shared = { 1 }
    expect(J.encode({ a = shared, b = shared })).eq('{"a":[1],"b":[1]}')
  end)

  it('limits depth', function()
    local deep = {}
    local at = deep
    for _ = 1, J.MAX_DEPTH + 2 do
      at.x = {}
      at = at.x
    end
    expect(function() J.encode(deep) end).error('too deep')
  end)
end)

describe('json decode', function()
  it('decodes scalars and whitespace', function()
    expect(J.decode(' true ')).eq(true)
    expect(J.decode('false')).eq(false)
    expect(J.decode('null')).eq(J.null)
    expect(J.decode('\t\r\n "x" \n')).eq('x')
  end)

  it('decodes numbers', function()
    expect(J.decode('0')).eq(0)
    expect(J.decode('-0.5')).eq(-0.5)
    expect(J.decode('1e3')).eq(1000)
    expect(J.decode('1E+3')).eq(1000)
    expect(J.decode('25e-1')).eq(2.5)
    expect(J.decode('9007199254740993')).eq(9007199254740992) -- same double as JS
    expect(J.decode('0.10000000000000001')).eq(0.1)
  end)

  it('reads an out-of-range exponent as inf, as JSON.parse does', function()
    expect(J.decode('1e400')).eq(math.huge)
    expect(J.decode('-1e400')).eq(-math.huge)
  end)

  it('rejects malformed numbers', function()
    for _, bad in ipairs({ '01', '-', '1.', '.5', '+1', '1e', '1e+', '0x10', 'NaN', 'Infinity', '-Infinity', '1.5.2' }) do
      expect(function() J.decode(bad) end).error('json:')
    end
  end)

  it('decodes escapes and \\u sequences, including surrogate pairs', function()
    expect(J.decode('"a\\"b\\\\c\\/d\\n\\t\\r\\b\\f"')).eq('a"b\\c/d\n\t\r\b\f')
    expect(J.decode('"\\u00e9\\u6f22"')).eq('é漢')
    expect(J.decode('"\\ud83d\\ude00"')).eq('😀')
    expect(J.decode('"\\u0000"')).eq('\0')
  end)

  it('replaces lone surrogates with U+FFFD', function()
    expect(J.decode('"\\ud800"')).eq('\239\191\189')
    expect(J.decode('"\\udc00x"')).eq('\239\191\189x')
    expect(J.decode('"\\ud800\\u0041"')).eq('\239\191\189A')
  end)

  it('rejects bad strings', function()
    expect(function() J.decode('"abc') end).error('unterminated')
    expect(function() J.decode('"a\nb"') end).error('control character')
    expect(function() J.decode('"\\x"') end).error('bad escape')
    expect(function() J.decode('"\\u12g4"') end).error('bad \\u')
    expect(function() J.decode("'a'") end).error('unexpected')
  end)

  it('drops null object fields and keeps array nulls as J.null', function()
    local v = J.decode('{"a":null,"b":[1,null,3],"c":1}')
    expect(v.a).eq(nil)
    expect(v.c).eq(1)
    expect(#v.b).eq(3)
    expect(v.b[2] == J.null).truthy()
  end)

  it('marks decoded arrays so [] re-encodes as []', function()
    local v = J.decode('{"a":[],"b":{}}')
    expect(J.is_array(v.a)).truthy()
    expect(J.encode(v)).eq('{"a":[],"b":{}}')
  end)

  it('decodes nesting', function()
    local v = J.decode('{"a":{"b":[{"c":[[1],[2,{"d":true}]]}]}}')
    expect(v.a.b[1].c[2][2].d).eq(true)
  end)

  it('limits nesting depth instead of overflowing the stack', function()
    expect(function() J.decode(string.rep('[', 1000) .. string.rep(']', 1000)) end).error('too deep')
    local ok_depth = string.rep('[', J.MAX_DEPTH) .. string.rep(']', J.MAX_DEPTH)
    expect(#J.decode(ok_depth)).eq(1)
  end)

  it('rejects structural errors and trailing data', function()
    for _, bad in ipairs({ '', ' ', '[1,]', '[1 2]', '{"a":1,}', '{"a" 1}', '{a:1}', '{"a":1', '[', 'tru', 'nul', '1 2', '{}x', '[]]', '{"a":1}}' }) do
      expect(function() J.decode(bad) end).error('json:')
    end
    expect(function() J.decode(42) end).error('expected a string')
  end)

  it('lets the last duplicate key win (like JSON.parse)', function()
    expect(J.decode('{"a":1,"a":2}').a).eq(2)
  end)
end)

describe('json round trip', function()
  it('round-trips a mailbox-shaped message', function()
    local msg = {
      s = 12, t = 'lobby_view',
      d = { me = 'u1', isHost = true, canStart = false, state = { code = 'ABC234', players = { { id = 'u1', name = 'Zoë 🃏' } }, kicked = J.array() } },
    }
    local back = rt(msg)
    expect(back.d.state.players[1].name).eq('Zoë 🃏')
    expect(J.encode(back)).eq(J.encode(msg))
  end)

  it('round-trips every byte value in a string', function()
    local bytes = {}
    for i = 0, 255 do bytes[#bytes + 1] = string.char(i) end
    local s = table.concat(bytes)
    expect(rt(s)).eq(s)
  end)

  it('decodes what JSON.stringify produces for a score string', function()
    expect(J.decode('{"score":"inf"}').score).eq('inf')
    expect(J.decode('{"score":"1.7976931348623157e+308"}').score).eq('1.7976931348623157e+308')
  end)
end)
