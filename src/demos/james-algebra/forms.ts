// James Algebra (Laws of Form) — core types and rewrites.
//
// KEY CONSTRAINT from the dragology framework:
//   d.between([stateA, stateB]) tracks the DRAGGED element by id/path.
//   The dragged element must exist in ALL target states.
//   Elements that vanish in a rewrite can't be triggers.

export type BoundaryType = "round" | "square" | "angle";

export type Form = {
  id: string;
  boundary: BoundaryType;
  children: Form[];
  label?: string;
  emergeFrom?: string;
};

export type RootForm = Form & { x: number; y: number };

export type State = {
  roots: RootForm[];
};

// ── id generation ──

let _nextId = 0;
function fid(prefix = "f"): string {
  return `${prefix}${_nextId++}`;
}

// ── constructors ──

export const R = (...children: Form[]): Form => ({
  id: fid("r"),
  boundary: "round",
  children,
});
export const S = (...children: Form[]): Form => ({
  id: fid("s"),
  boundary: "square",
  children,
});
export const A = (...children: Form[]): Form => ({
  id: fid("a"),
  boundary: "angle",
  children,
});

export function mkState(...positioned: [Form, number, number][]): State {
  return {
    roots: positioned.map(([form, x, y]) => ({ ...form, x, y })),
  };
}

// ── tree helpers ──

function containsId(form: Form, id: string): boolean {
  if (form.id === id) return true;
  return form.children.some((c) => containsId(c, id));
}

/** Replace a node (by id) with zero or more replacement nodes in its parent's children. */
function replaceInForm(tree: Form, targetId: string, replacement: Form[]): Form {
  let changed = false;
  const newChildren: Form[] = [];
  for (const child of tree.children) {
    if (child.id === targetId) {
      changed = true;
      newChildren.push(...replacement);
    } else {
      const updated = replaceInForm(child, targetId, replacement);
      if (updated !== child) changed = true;
      newChildren.push(updated);
    }
  }
  return changed ? { ...tree, children: newChildren } : tree;
}

/** Replace a node in the state (across all roots). Replacements that bubble
 *  up to root level become new roots positioned near the original. */
function replaceInState(
  state: State,
  targetId: string,
  replacement: Form[],
): State {
  const newRoots: RootForm[] = [];
  for (const root of state.roots) {
    if (root.id === targetId) {
      // The root itself is being replaced — spread replacements as new roots
      let xOff = 0;
      for (const r of replacement) {
        newRoots.push({ ...r, x: Math.round(root.x + xOff), y: Math.round(root.y) });
        xOff += 60;
      }
    } else {
      const updated = replaceInForm(root, targetId, replacement);
      if (updated === root) {
        newRoots.push(root);
      } else {
        // Check if the replacement caused children to bubble up
        newRoots.push({ ...updated, x: root.x, y: root.y });
      }
    }
  }
  return { roots: newRoots };
}

// ── Clarify rewrite ──
//   ([A]) → A  or  [(A)] → A
//   Trigger must be a grandchild (survives the rewrite).

function invertiblePair(a: BoundaryType, b: BoundaryType): boolean {
  return (
    (a === "round" && b === "square") || (a === "square" && b === "round")
  );
}

function isClarifiable(form: Form): boolean {
  return (
    form.children.length === 1 &&
    invertiblePair(form.boundary, form.children[0].boundary)
  );
}

export function allRewrites(
  state: State,
  triggerId: string,
): State[] {
  const results: State[] = [];

  function walkClarify(form: Form) {
    if (isClarifiable(form)) {
      const inner = form.children[0];
      const grandchildHasTrigger = inner.children.some((gc) =>
        containsId(gc, triggerId),
      );
      if (grandchildHasTrigger) {
        const grandchildren = inner.children;
        results.push(replaceInState(state, form.id, grandchildren));
      }
    }
    for (const child of form.children) {
      walkClarify(child);
    }
  }

  for (const root of state.roots) {
    walkClarify(root);
  }

  return results;
}
