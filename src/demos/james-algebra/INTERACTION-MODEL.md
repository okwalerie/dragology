# James Algebra Interaction Model

## Dragology Primitive Reference (complete)

### Builders (create a DragSpec from scratch)

| primitive | what it does | when to use |
|-----------|-------------|-------------|
| `d.fixed(state)` | renders state statically, gap = distance to dragged element's position | a single discrete target |
| `d.between([s₁, s₂, ...], {interpolation?})` | smooth morph between states; pointer position maps to convex hull of dragged element's positions across states. interpolation: `"delaunay"` (default) or `"natural-neighbor"` | structural transformations where the world changes shape |
| `d.closest([spec₁, spec₂, ...], {stickiness?})` | evaluates ALL sub-specs each frame, picks the one with lowest gap (closest to pointer). stickiness adds hysteresis to prevent jitter | multiple exclusive interaction modes |
| `d.vary(state, [params], {constraint?, pin?})` | continuous optimization — params track pointer via COBYLA solver. constraint function returns values that must be ≤ 0. pin holds values constant | free positioning, sliders, bounded movement |
| `d.dropTarget(targetId, state)` | gap = 0 when pointer is inside element bounds, ∞ when outside | tap-zone based interactions |
| `d.switchToStateAndFollow(state, newDraggedId, followSpec?)` | immediately transitions to new state and continues drag from a DIFFERENT element (by id). if followSpec omitted, reads dragology from the new element | hand-off: start dragging one thing, continue as another |
| `d.substate(state, path, fn)` | lens into a sub-path of state. fn receives a builder for the substate type | composing independently-defined drag behaviors |
| `d.reactTo(iterator, callback)` | re-initializes child behavior whenever the iterator's value changes | keyboard modifiers (alt-drag = copy), mode toggling mid-drag |

### Modifiers (wrap an existing DragSpec)

| modifier | effect on preview | effect on drop | when to use |
|----------|------------------|----------------|-------------|
| `.onDrop(state)` | unchanged | overrides drop state | preview ≠ result (e.g., cancel animation shows approach, drop produces void) |
| `.whenFar(altSpec, {gap?})` | switches to altSpec when pointer exceeds gap threshold (default 50px) | altSpec's drop | escape hatch / eject / free-float fallback |
| `.withFloating({ghost?, tether?})` | dragged element lifts above backdrop. ghost shows original position. tether limits float distance | pick-up-and-place interactions |
| `.withSnapRadius(r, {transition?, chain?})` | snaps preview to drop state when dragged element is within r pixels of target position. chain = restart drag in new state | multi-step rewrite sequences |
| `.withChaining(opts?)` | when drop state changes, immediately chain into new drag from that state | continuous manipulation without lifting |
| `.withDropTransition(transition?)` | N/A | controls easing of drop animation (default: 200ms cubic-out) | smoothing drops |
| `.withBranchTransition(transition)` | controls easing when switching between branches of closest/whenFar | N/A | smooth mode transitions |
| `.during(fn)` | transforms state each frame for preview (but NOT drop) | unchanged | live visual feedback during drag |
| `.changeGap(fn)` | reweights the gap measurement | unchanged | bias closest toward/away from certain targets |
| `.changeResult(fn)` | transforms entire DragResult each frame | can change drop state | advanced: full control |
| `.withInitContext(fn)` | overrides DragInitContext (pointerLocal, draggedPath) before init | N/A | reparenting the drag anchor |

## Composable Patterns

### Pattern 1: Rewrite (nool-tree)
```
d.closest(targets.map(t => d.between([current, t])))
  .withSnapRadius(1, { chain: true })
```
**Gesture**: drag toward transformation, morph smoothly, snap + continue.
**Constraint**: dragged element must EXIST in all target states.
**Use for**: clarify, disperse (where dragged content survives)

### Pattern 2: Snap-to-Islands (snap-to-islands)
```
d.closest(discreteTargets.map(t => d.fixed(t)))
  .withFloating()
  .whenFar(d.vary(freeState, [x, y]))
```
**Gesture**: near valid landing → snap in (floating preview). far → free drag.
**Constraint**: none on element survival (floating handles it).
**Use for**: adopt (root → child), transfer (child → different parent), collect

### Pattern 3: Pick-up Rearrange (canvas-of-lists-nested)
```
const without = removeFrom(state, id);
const placements = allValidPlacements(without, item);
d.closest(placements)
  .withFloating()
  .whenFar(d.vary(freeState, [x, y]))
```
**Gesture**: lift out, show all valid positions, snap to nearest, or float free.
**Use for**: rearrange within container, transfer between containers

### Pattern 4: Constrained Vary
```
d.vary(state, [params], {
  constraint: (s) => [lessThan(0, s.x), lessThan(s.x, maxX)]
})
```
**Gesture**: drag along constrained axes/bounds.
**Use for**: repositioning within container bounds

### Pattern 5: Mode Switch (reactTo)
```
d.reactTo(altKey, (isAlt) =>
  isAlt ? copyBehavior : moveBehavior
)
```
**Gesture**: hold modifier key to change drag meaning.
**Use for**: alt-drag to copy, shift-drag to constrain axis

### Pattern 6: Hand-off (switchToStateAndFollow)
```
d.switchToStateAndFollow(newState, newElementId)
```
**Gesture**: drag element A, mid-drag it transforms, continue dragging as element B.
**Use for**: enfold (drag A, mid-drag A becomes ([A]), continue dragging the wrapper)

## James Algebra: Form Roles & Transitions

### What IS the form being dragged?

| role | description | example |
|------|-------------|---------|
| **root** | top-level form with global x,y | `()` floating free |
| **child** | nested inside a boundary, local x,y | `()` inside `([...])` |
| **grandchild-of-clarifiable** | inside a `([...])` or `[(...)]` pair | `()` inside `([()])` |
| **reflection-partner** | `<F>` exists as sibling | `a` next to `<a>` |
| **container** | has children, could receive drops | `([])` |
| **leaf** | no children | `()` empty round |

### Valid transitions from each role

| from | to | axiom | who triggers | who survives | pattern |
|------|----|-------|-------------|-------------|---------|
| grandchild of `([A])` | promoted to parent level | **clarify** | A (grandchild) | A survives, outer `()[]` vanish | rewrite (1) |
| root | grandchild of new `([A])` | **enfold** | A | A survives (deeper now) | hand-off (6) or snap-to-islands (2) |
| child of `(ctx [B C])` | own frame `(ctx [B])` | **disperse** | B or C | B/C survive, frame duplicates | rewrite (1) |
| root frame + root frame | merged frame | **collect** | either frame | merged frame survives, one original vanishes | snap-to-islands (2) with `.onDrop` |
| sibling of `<F>` | void | **cancel** | ??? (both vanish) | NEITHER — use floating+onDrop | snap-to-islands (2) with `.onDrop(voidState)` |
| nothing | `F` + `<F>` | **create** | N/A (gesture from nothing) | both are new | palette/toolbar drag (3) |
| child | root | **eject** | the child | child survives as root | `.whenFar(d.vary(...))` |
| root | child of container | **adopt** | the root | root survives as child | snap-to-islands (2) |
| child of P | child of Q | **transfer** | the child | child survives, changes parent | snap-to-islands (2) |
| any | same, different position | **reposition** | the form | same form | d.vary (4) |

### The Survival Problem

`d.between` needs the dragged element in ALL states. Some axioms destroy the trigger:

| axiom | problem | solution |
|-------|---------|----------|
| **cancel** (`a <a> → ∅`) | both `a` and `<a>` vanish | use `d.fixed(voidState).withFloating().onDrop(voidState)` — preview shows approach, drop removes both |
| **collect** (`(ctx[B])(ctx[C]) → (ctx[BC])`) | one frame vanishes | use `d.fixed(mergedState).withFloating()` — floating frame approaches, backdrop shows merged result |
| **create** (`→ a <a>`) | elements don't exist yet | palette/toolbar pattern — drag FROM a template, which clones on lift |

### Gestures Not Yet Mapped

- **Proximity grouping** (card-piles): drag two roots near each other → they implicitly become siblings in an auto-created container
- **Split gesture**: drag one child away from siblings → parent splits (disperse)
- **Merge gesture**: drag one container onto another → contents merge (collect)
- **Double-tap / long-press**: create a new empty boundary at tap location
- **Alt-drag**: copy instead of move
