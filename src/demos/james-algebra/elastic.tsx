// James Algebra with elastic 2D containment.
// Children float freely inside their parent's boundary.
// Drag far enough out → eject to root. Drag near a container → snap in.

import _ from "lodash";
import { demo } from "../../demo";
import { DemoDraggable, DemoWithConfig } from "../../demo/ui";
import { Draggable } from "../../draggable";
import { type DragSpecBuilder, param } from "../../DragSpec";
import { Svgx } from "../../svgx";
import { translate } from "../../svgx/helpers";

// ── Types ──

type BoundaryType = "round" | "square" | "angle";

type Form = {
  id: string;
  boundary: BoundaryType;
  children: Form[];
  x: number;
  y: number;
};

type State = {
  roots: Form[];
};

// ── Constructors ──

let _nid = 0;
const fid = (p: string) => `${p}${_nid++}`;

const R = (x: number, y: number, ...children: Form[]): Form => ({
  id: fid("r"), boundary: "round", children, x, y,
});
const S = (x: number, y: number, ...children: Form[]): Form => ({
  id: fid("s"), boundary: "square", children, x, y,
});

// ── Layout ──

const PAD = 20;
const EMPTY_SIZE = 40;

type Bounds = { w: number; h: number };

function formBounds(form: Form): Bounds {
  if (form.children.length === 0) {
    return { w: EMPTY_SIZE, h: EMPTY_SIZE };
  }
  // normalize: treat all children as if their min x,y is 0
  // this prevents the container from ballooning when vary pushes coords negative
  let minX = Infinity, minY = Infinity;
  for (const child of form.children) {
    minX = Math.min(minX, child.x);
    minY = Math.min(minY, child.y);
  }
  let maxW = 0, maxH = 0;
  for (const child of form.children) {
    const cb = formBounds(child);
    maxW = Math.max(maxW, (child.x - minX) + cb.w);
    maxH = Math.max(maxH, (child.y - minY) + cb.h);
  }
  return {
    w: Math.max(EMPTY_SIZE, maxW + PAD * 2),
    h: Math.max(EMPTY_SIZE, maxH + PAD * 2),
  };
}

function childOffset(form: Form): { dx: number; dy: number } {
  if (form.children.length === 0) return { dx: 0, dy: 0 };
  let minX = Infinity, minY = Infinity;
  for (const child of form.children) {
    minX = Math.min(minX, child.x);
    minY = Math.min(minY, child.y);
  }
  // shift so minimum child starts at PAD
  return { dx: PAD - minX, dy: PAD - minY };
}

// ── Colors ──

const COLORS: Record<string, { fill: string; stroke: string }> = {
  round:  { fill: "#fde68a", stroke: "#b45309" },
  square: { fill: "#bfdbfe", stroke: "#1d4ed8" },
  angle:  { fill: "#e9d5ff", stroke: "#7e22ce" },
};

// ── Tree helpers ──

function containsId(form: Form, id: string): boolean {
  if (form.id === id) return true;
  return form.children.some((c) => containsId(c, id));
}

function findById(form: Form, id: string): Form | null {
  if (form.id === id) return form;
  for (const c of form.children) {
    const f = findById(c, id);
    if (f) return f;
  }
  return null;
}

function removeFromForm(form: Form, targetId: string): Form {
  const newChildren = form.children
    .filter((c) => c.id !== targetId)
    .map((c) => removeFromForm(c, targetId));
  if (
    newChildren.length === form.children.length &&
    newChildren.every((c, i) => c === form.children[i])
  )
    return form;
  return { ...form, children: newChildren };
}

function addChildToForm(form: Form, parentId: string, child: Form): Form {
  if (form.id === parentId) {
    return { ...form, children: [...form.children, child] };
  }
  let changed = false;
  const newChildren = form.children.map((c) => {
    const u = addChildToForm(c, parentId, child);
    if (u !== c) changed = true;
    return u;
  });
  return changed ? { ...form, children: newChildren } : form;
}

function replaceInForm(form: Form, targetId: string, replacement: Form[]): Form {
  let changed = false;
  const newChildren: Form[] = [];
  for (const c of form.children) {
    if (c.id === targetId) {
      changed = true;
      newChildren.push(...replacement);
    } else {
      const u = replaceInForm(c, targetId, replacement);
      if (u !== c) changed = true;
      newChildren.push(u);
    }
  }
  return changed ? { ...form, children: newChildren } : form;
}

// ── State operations ──

function removeFromState(state: State, id: string): { state: State; removed: Form | null } {
  const ri = state.roots.findIndex((r) => r.id === id);
  if (ri >= 0) {
    return { removed: state.roots[ri], state: { roots: state.roots.filter((_, i) => i !== ri) } };
  }
  for (const root of state.roots) {
    const found = findById(root, id);
    if (found) {
      return {
        removed: found,
        state: { roots: state.roots.map((r) => removeFromForm(r, id)) },
      };
    }
  }
  return { removed: null, state };
}

function addToParent(state: State, parentId: string, child: Form): State {
  return {
    roots: state.roots.map((r) => addChildToForm(r, parentId, child)),
  };
}

// ── Find param path to a form's x or y at any depth ──
// Returns the path segments for use with param(), e.g.
// ["roots", 0, "children", 2, "children", 1, "x"]

/** Build d.vary params for a form at any nesting depth.
 *  Returns null if the form can't be found. */
function makeVarySpec(
  d: DragSpecBuilder<State>,
  state: State,
  id: string,
): ReturnType<DragSpecBuilder<State>["vary"]> | null {
  // root level
  for (let ri = 0; ri < state.roots.length; ri++) {
    if (state.roots[ri].id === id) {
      return d.vary(state, [
        param("roots", ri, "x"),
        param("roots", ri, "y"),
      ]);
    }
  }
  // depth 1: roots[ri].children[ci]
  for (let ri = 0; ri < state.roots.length; ri++) {
    const root = state.roots[ri];
    for (let ci = 0; ci < root.children.length; ci++) {
      if (root.children[ci].id === id) {
        return d.vary(state, [
          param("roots", ri, "children", ci, "x"),
          param("roots", ri, "children", ci, "y"),
        ]);
      }
    }
  }
  // depth 2: roots[ri].children[ci].children[di]
  for (let ri = 0; ri < state.roots.length; ri++) {
    const root = state.roots[ri];
    for (let ci = 0; ci < root.children.length; ci++) {
      const c = root.children[ci];
      for (let di = 0; di < c.children.length; di++) {
        if (c.children[di].id === id) {
          return d.vary(state, [
            param("roots", ri, "children", ci, "children", di, "x"),
            param("roots", ri, "children", ci, "children", di, "y"),
          ]);
        }
      }
    }
  }
  // depth 3
  for (let ri = 0; ri < state.roots.length; ri++) {
    for (let ci = 0; ci < state.roots[ri].children.length; ci++) {
      const c = state.roots[ri].children[ci];
      for (let di = 0; di < c.children.length; di++) {
        const e = c.children[di];
        for (let ei = 0; ei < e.children.length; ei++) {
          if (e.children[ei].id === id) {
            return d.vary(state, [
              param("roots", ri, "children", ci, "children", di, "children", ei, "x"),
              param("roots", ri, "children", ci, "children", di, "children", ei, "y"),
            ]);
          }
        }
      }
    }
  }
  return null;
}

// ── Find all islands (drop targets) ──

type Island = { state: State };

function findIslands(state: State, draggedId: string): Island[] {
  const { removed, state: without } = removeFromState(state, draggedId);
  if (!removed) return [];

  const islands: Island[] = [];

  function walk(form: Form) {
    // don't allow dropping into descendants of the dragged form
    if (containsId(form, draggedId)) return;

    // compute a generous drop position — center of the container
    const b = formBounds(form);
    const dropX = Math.round(b.w / 2 - EMPTY_SIZE / 2);
    const dropY = Math.round(b.h / 2 - EMPTY_SIZE / 2);
    const dropChild: Form = { ...removed!, x: dropX, y: dropY };
    islands.push({ state: addToParent(without, form.id, dropChild) });

    for (const c of form.children) walk(c);
  }

  for (const root of without.roots) walk(root);
  return islands;
}

// ── Clarify ──

function invertiblePair(a: BoundaryType, b: BoundaryType): boolean {
  return (a === "round" && b === "square") || (a === "square" && b === "round");
}

function isClarifiable(form: Form): boolean {
  return form.children.length === 1 && invertiblePair(form.boundary, form.children[0].boundary);
}

function clarifyRewrites(state: State, triggerId: string): State[] {
  const results: State[] = [];

  function walk(form: Form) {
    if (isClarifiable(form)) {
      const inner = form.children[0];
      if (inner.children.some((gc) => containsId(gc, triggerId))) {
        const ri = state.roots.findIndex((r) => r.id === form.id);
        if (ri >= 0) {
          const newRoots = [...state.roots];
          newRoots.splice(ri, 1);
          let xOff = 0;
          for (const gc of inner.children) {
            newRoots.push({ ...gc, x: Math.round(form.x + xOff), y: Math.round(form.y) });
            xOff += 60;
          }
          results.push({ roots: newRoots });
        } else {
          const newRoots = state.roots.map((r) =>
            replaceInForm(r, form.id, inner.children),
          );
          results.push({ roots: newRoots });
        }
      }
    }
    for (const c of form.children) walk(c);
  }

  for (const root of state.roots) walk(root);
  return results;
}

// ── Render ──

function renderForm(
  state: State,
  form: Form,
  d: DragSpecBuilder<State>,
  depth: number,
): { element: Svgx; w: number; h: number } {
  const bounds = formBounds(form);
  const { dx, dy } = childOffset(form);
  const colors = COLORS[form.boundary] ?? COLORS.round;
  const rx = form.boundary === "round" ? Math.min(14, bounds.w * 0.15) : form.boundary === "square" ? 3 : 0;

  const childElements: Svgx[] = [];
  for (let i = 0; i < form.children.length; i++) {
    const child = form.children[i];
    const cr = renderForm(state, child, d, depth + 1);
    childElements.push(
      <g id={`${form.id}-slot-${i}`} transform={translate(child.x + dx, child.y + dy)}>
        {cr.element}
      </g>,
    );
  }

  let shape: Svgx;
  if (form.boundary === "angle") {
    const cx = bounds.w / 2, cy = bounds.h / 2;
    shape = (
      <polygon
        points={`${cx},1 ${bounds.w - 1},${cy} ${cx},${bounds.h - 1} 1,${cy}`}
        fill={colors.fill} stroke={colors.stroke} strokeWidth={1.5} fillOpacity={0.3}
      />
    );
  } else {
    shape = (
      <rect
        x={0} y={0} width={bounds.w} height={bounds.h} rx={rx}
        fill={colors.fill} stroke={colors.stroke} strokeWidth={1.5} fillOpacity={0.3}
      />
    );
  }

  const element = (
    <g
      id={form.id}
      dragology={() => makeDragSpec(d, state, form.id)}
      dragologyZIndex={depth}
    >
      {shape}
      {childElements}
    </g>
  );

  return { element, w: bounds.w, h: bounds.h };
}

// ── Drag spec ──

function makeDragSpec(
  d: DragSpecBuilder<State>,
  state: State,
  draggedId: string,
) {
  // 1. Clarify rewrites
  const clarifyTargets = clarifyRewrites(state, draggedId);
  if (clarifyTargets.length > 0) {
    return d
      .closest(clarifyTargets.map((t) => d.between([state, t])))
      .withSnapRadius(1, { chain: true });
  }

  // 2. Try to build vary-in-place spec (works at any depth up to 3)
  const varyInPlace = makeVarySpec(d, state, draggedId);

  // 3. Islands for snap-to-container
  const islands = findIslands(state, draggedId);
  const snapTargets = islands.map((isl) => d.fixed(isl.state));

  // 4. Build the "ejected" state for whenFar
  const { removed, state: without } = removeFromState(state, draggedId);
  const ejectSpec = (() => {
    if (!removed) return null;
    const ejected: State = {
      roots: [...without.roots, { ...removed, x: 0, y: 0 }],
    };
    const ejIdx = ejected.roots.length - 1;
    return d.vary(ejected, [
      param("roots", ejIdx, "x"),
      param("roots", ejIdx, "y"),
    ]);
  })();

  if (varyInPlace) {
    const isRoot = state.roots.some((r) => r.id === draggedId);

    if (isRoot) {
      // Root form: snap to islands when close, free-drag when far.
      // d.closest gets ONLY discrete island targets (not vary).
      // vary goes in whenFar for the continuous free-drag fallback.
      if (snapTargets.length > 0) {
        return d
          .closest(snapTargets)
          .withFloating()
          .whenFar(varyInPlace);
      }
      return varyInPlace;
    }

    // Nested child: snap to islands when close, vary inside parent otherwise,
    // eject to root when far from everything.
    if (snapTargets.length > 0 && ejectSpec) {
      return d
        .closest(snapTargets)
        .withFloating()
        .whenFar(ejectSpec);
    }
    if (ejectSpec) {
      return varyInPlace.whenFar(ejectSpec);
    }
    return varyInPlace;
  }

  // Fallback: no vary path found — just float
  if (ejectSpec) {
    if (snapTargets.length > 0) {
      return d
        .closest(snapTargets)
        .withFloating()
        .whenFar(ejectSpec);
    }
    return ejectSpec;
  }

  return d.between([state]);
}

// ── Draggable ──

const draggable: Draggable<State> = ({ state, d }) => (
  <g>
    {state.roots.map((root, idx) => {
      const r = renderForm(state, root, d, 0);
      return (
        <g id={`root-${idx}`} transform={translate(root.x, root.y)}>
          {r.element}
        </g>
      );
    })}
  </g>
);

// ── Initial state ──

const initialState: State = {
  roots: [
    R(20, 20, S(8, 8, R(8, 8), R(60, 8))),   // ([ ()  () ])
    R(220, 20, S(8, 8)),                        // ([])
    R(220, 130, S(8, 8)),                        // ([])
    R(370, 50),                                  // ()
    R(370, 130),                                 // ()
  ],
};

// ── Demo ──

export default demo(
  () => (
    <DemoWithConfig>
      <DemoDraggable
        draggable={draggable}
        initialState={initialState}
        width={500}
        height={300}
      />
    </DemoWithConfig>
  ),
  {
    tags: [
      "d.closest",
      "d.vary",
      "spec.withFloating",
      "spec.whenFar",
      "math",
    ],
  },
);
