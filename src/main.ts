import {
  Plugin,
  WorkspaceLeaf,
  Menu,
  TFile,
  MarkdownView,
} from "obsidian";

export default class MirrorPreviewPlugin extends Plugin {
  slaveLeaf: WorkspaceLeaf | null = null;
  private syncing = false;
  private lastFile: string | null = null;

  async onload() {
    console.log("[MirrorPreview] loaded");

    this.addRibbonIcon("square-split-horizontal", "Mirror pane", () => {
      this.createOrFocusMirror();
    });

    // Add custom CSS
    const style = document.createElement("style");
    style.textContent = `
      .mirror-preview-pane {
        background: rgba(128, 128, 128, 0.05) !important;
        border-left: 3px solid rgba(128, 128, 128, 0.3) !important;
      }
      .mirror-preview-pane .view-header {
        background: rgba(128, 128, 128, 0.1) !important;
      }
      .mirror-preview-pane::before {
        content: "🔗 MIRROR";
        position: absolute;
        top: 4px;
        right: 8px;
        font-size: 10px;
        color: rgba(128, 128, 128, 0.6);
        font-weight: bold;
        pointer-events: none;
        z-index: 100;
      }
      /* Hide edit mode button */
      .mirror-preview-pane .view-header .view-actions {
        display: none !important;
      }
      /* Force read mode appearance */
      .mirror-preview-pane .markdown-source-view {
        display: none !important;
      }
      .mirror-preview-pane .markdown-reading-view {
        display: block !important;
      }
    `;
    document.head.appendChild(style);

    this.registerEvent(
      this.app.workspace.on("layout-change", () => {
        this.checkSlaveLeafExists();
        // Force preview mode on layout change
        this.forcePreviewMode();
      })
    );

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        if (leaf === this.slaveLeaf) return;
        this.checkSlaveLeafExists();
        if (this.slaveLeaf) {
          this.syncSlave();
        }
      })
    );

    // Prevent mode changes in slave
    this.registerEvent(
      this.app.workspace.on("editor-change", () => {
        this.forcePreviewMode();
      })
    );

    this.registerEvent(
      (this.app.workspace as any).on(
        "file-menu",
        (menu: Menu, file: TFile) => {
          menu.addItem((item: any) => {
            item
              .setTitle("Mirror pane as preview")
              .setIcon("square-split-horizontal")
              .onClick(() => {
                this.createOrFocusMirror();
              });
          });
        }
      )
    );
  }

  forcePreviewMode() {
    if (!this.slaveLeaf) return;
    
    const view = this.slaveLeaf.view;
    if (view instanceof MarkdownView) {
      const state = view.getState();
      if (state.mode !== "preview") {
        view.setState({ ...state, mode: "preview" }, { history: false });
      }
    }
  }

  checkSlaveLeafExists() {
    if (!this.slaveLeaf) return;
    
    const leaves = this.app.workspace.getLeavesOfType("markdown");
    const exists = leaves.includes(this.slaveLeaf as any);
    
    if (!exists) {
      console.log("[MirrorPreview] slave leaf closed");
      this.slaveLeaf = null;
      this.lastFile = null;
    }
  }

  getMasterLeaf(): WorkspaceLeaf | null {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    return view?.leaf ?? null;
  }

  async createOrFocusMirror() {
    const master = this.getMasterLeaf();
    if (!master) {
      console.log("[MirrorPreview] no master leaf found");
      return;
    }

    const state = master.getViewState().state as { file?: string } | undefined;
    if (!state?.file) {
      console.log("[MirrorPreview] no file in master");
      return;
    }

    const file = this.app.vault.getAbstractFileByPath(state.file);
    if (!(file instanceof TFile)) return;

    if (!this.slaveLeaf) {
      this.slaveLeaf = this.app.workspace.getLeaf("split", "vertical");
      console.log("[MirrorPreview] slave created");
      
      await this.slaveLeaf.openFile(file, { mode: "preview" });
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

  async syncSlave() {
    if (this.syncing || !this.slaveLeaf) return;

    const master = this.getMasterLeaf();
    if (!master) return;

    const state = master.getViewState().state as { file?: string } | undefined;
    if (!state?.file) return;

    if (this.lastFile === state.file) return;

    const file = this.app.vault.getAbstractFileByPath(state.file);
    if (!(file instanceof TFile)) return;

    console.log("[MirrorPreview] syncing:", state.file);

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
    } catch (error) {
      console.error("[MirrorPreview] sync error:", error);
    } finally {
      this.syncing = false;
    }
  }

  onunload() {
    console.log("[MirrorPreview] unloaded");
  }
}