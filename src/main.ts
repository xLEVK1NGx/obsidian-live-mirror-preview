import {
  Plugin,
  WorkspaceLeaf,
  Menu,
  TFile,
  MarkdownView,
  EventRef,
} from "obsidian";

export default class MirrorPreviewPlugin extends Plugin {
  slaveLeaf: WorkspaceLeaf | null = null;
  private syncing = false;
  private lastFile: string | null = null;

  async onload(): Promise<void> {
    this.addRibbonIcon("square-split-horizontal", "Mirror pane", () => {
      void this.createOrFocusMirror();
    });

    this.registerEvent(
      this.app.workspace.on("layout-change", () => {
        this.checkSlaveLeafExists();
        this.forcePreviewMode();
      })
    );

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        if (leaf === this.slaveLeaf) return;
        this.checkSlaveLeafExists();
        if (this.slaveLeaf) {
          void this.syncSlave();
        }
      })
    );

    this.registerEvent(
      this.app.workspace.on("editor-change", () => {
        this.forcePreviewMode();
      })
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    this.registerEvent(
      (this.app.workspace as any).on("file-menu", (menu: Menu, file: TFile) => {
        menu.addItem((item) => {
          item
            .setTitle("Mirror pane as preview")
            .setIcon("square-split-horizontal")
            .onClick(() => {
              void this.createOrFocusMirror();
            });
        });
      })
    );
  }

  forcePreviewMode(): void {
    if (!this.slaveLeaf) return;
    
    const view = this.slaveLeaf.view;
    if (view instanceof MarkdownView) {
      const state = view.getState();
      if (state.mode !== "preview") {
        view.setState({ ...state, mode: "preview" }, { history: false });
      }
    }
  }

  checkSlaveLeafExists(): void {
    if (!this.slaveLeaf) return;
    
    const leaves = this.app.workspace.getLeavesOfType("markdown");
    const exists = leaves.includes(this.slaveLeaf as WorkspaceLeaf);
    
    if (!exists) {
      this.slaveLeaf = null;
      this.lastFile = null;
    }
  }

  getMasterLeaf(): WorkspaceLeaf | null {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    return view?.leaf ?? null;
  }

  async createOrFocusMirror(): Promise<void> {
    const master = this.getMasterLeaf();
    if (!master) return;

    const state = master.getViewState().state as { file?: string } | undefined;
    if (!state?.file) return;

    const file = this.app.vault.getAbstractFileByPath(state.file);
    if (!(file instanceof TFile)) return;

    if (!this.slaveLeaf) {
      this.slaveLeaf = this.app.workspace.getLeaf("split", "vertical");
      
      await this.slaveLeaf.openFile(file);
      await this.slaveLeaf.setViewState({
        type: "markdown",
        state: {
          file: state.file,
          mode: "preview",
        },
        active: false,
      });
      
      this.slaveLeaf.view.containerEl.classList.add("mirror-preview-pane");
      this.lastFile = state.file;
    } else {
      await this.syncSlave();
    }
  }

  async syncSlave(): Promise<void> {
    if (this.syncing || !this.slaveLeaf) return;

    const master = this.getMasterLeaf();
    if (!master) return;

    const state = master.getViewState().state as { file?: string } | undefined;
    if (!state?.file) return;

    if (this.lastFile === state.file) return;

    const file = this.app.vault.getAbstractFileByPath(state.file);
    if (!(file instanceof TFile)) return;

    this.syncing = true;

    try {
      await this.slaveLeaf.setViewState({
        type: "markdown",
        state: {
          file: state.file,
          mode: "preview",
        },
        active: false,
      });

      if (this.slaveLeaf.view?.containerEl) {
        this.slaveLeaf.view.containerEl.classList.add("mirror-preview-pane");
      }

      this.forcePreviewMode();
      this.lastFile = state.file;
    } finally {
      this.syncing = false;
    }
  }

  onunload(): void {
    // Cleanup
  }
}