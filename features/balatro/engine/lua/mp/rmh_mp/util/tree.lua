-- rmh_mp/util/tree.lua — surgery on UIBox definition trees ({n=..., config={...}, nodes={...}}).
--
-- Used by the HUD / blind-select / options wraps (WS6, WS11): wrap the builder, then edit the
-- returned table before the game turns it into a UIBox. Pure data; no game calls.
--
--   tree.walk(node, fn(node, parent, index))     depth-first; fn returning true stops the walk
--   tree.find(node, pred)       -> node, parent, index
--   tree.find_id(node, id)      -> node, parent, index   (config.id == id)
--   tree.find_button(node, b)   -> node, parent, index   (config.button == b)
--   tree.contains_id(node, id)  -> bool                 (anywhere in the subtree)
--   tree.replace(node, pred, new) / tree.remove(node, pred) / tree.insert_after(node, pred, new)
--                               -> true when something changed

local tree = {}

function tree.walk(node, fn, parent, index)
  if type(node) ~= 'table' then return false end
  if fn(node, parent, index) then return true end
  local kids = node.nodes
  if type(kids) == 'table' then
    for i = 1, #kids do
      if tree.walk(kids[i], fn, node, i) then return true end
    end
  end
  return false
end

function tree.find(root, pred)
  local found, fparent, findex
  tree.walk(root, function(n, p, i)
    if pred(n) then found, fparent, findex = n, p, i; return true end
  end)
  return found, fparent, findex
end

function tree.find_id(root, id)
  return tree.find(root, function(n) return n.config and n.config.id == id end)
end

function tree.find_button(root, button)
  return tree.find(root, function(n) return n.config and n.config.button == button end)
end

function tree.contains_id(root, id)
  return tree.find_id(root, id) ~= nil
end

function tree.replace(root, pred, new_node)
  local _, parent, index = tree.find(root, pred)
  if not parent then return false end
  parent.nodes[index] = new_node
  return true
end

function tree.remove(root, pred)
  local _, parent, index = tree.find(root, pred)
  if not parent then return false end
  table.remove(parent.nodes, index)
  return true
end

function tree.insert_after(root, pred, new_node)
  local _, parent, index = tree.find(root, pred)
  if not parent then return false end
  table.insert(parent.nodes, index + 1, new_node)
  return true
end

return tree
