/*
 * Copyright (c) 2022-2024 Rob Royce
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */
import { Component, HostListener, OnInit, ViewChild } from '@angular/core';
import { ChildrenOutletContexts, NavigationEnd, Router } from '@angular/router';
import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog';
import { environment } from '@environments/environment';
import { SettingsService } from '@services/ipc-services/settings.service';
import { ProjectService } from '@services/factory-services/project.service';
import { KsFactoryService } from '@services/factory-services/ks-factory.service';
import { ElectronIpcService } from '@services/ipc-services/electron-ipc.service';
import { ThemeService } from '@services/user-services/theme.service';
import { NotificationsService } from '@services/user-services/notifications.service';
import { IngestService } from '@services/ingest-services/ingest.service';
import { DragAndDropService } from '@services/ingest-services/drag-and-drop.service';
import { KsCommandService } from '@services/command-services/ks-command.service';
import { KsDetailsComponent } from '@components/source-components/ks-details.component';
import { debounceTime, map, take, tap } from 'rxjs/operators';
import { BehaviorSubject, Observable, throttleTime } from 'rxjs';
import { StartupService } from '@services/ipc-services/startup.service';
import { ProjectCommandService } from '@services/command-services/project-command.service';
import { ProjectDetailsComponent } from '@components/project-components/project-details.component';
import { fadeIn, fadeInAndOut, flyInOut } from './animations';
import { ChatService } from '@services/chat-services/chat.service';
import { OverlayPanel } from 'primeng/overlaypanel';
import { ProTipService } from '@services/command-services/pro-tip.service';
import { ProTipsComponent } from '@components/shared/pro-tips.component';
import {
  SidebarItem,
  SidebarService,
} from '@services/factory-services/sidebar.service';
import { ConfirmationService, MenuItem, PrimeIcons } from 'primeng/api';
import { ProjectUpdateRequest } from '@app/models/project.model';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  animations: [fadeInAndOut, flyInOut, fadeIn],
})
export class AppComponent implements OnInit {
  @ViewChild('proTipOverlay', { static: true })
  proTipsOverlay!: OverlayPanel;

  @ViewChild('proTipComponent', { static: true })
  proTipsComponent!: ProTipsComponent;

  /* The current project id */
  projectId = '';

  /* Whether the project tree is visible */
  projectTreeVisible = true;

  /* Whether the app is ready to show the main view */
  readyToShow = false;

  /* The number of items in the inbox (used for the badge) */
  inboxBadge = 0;

  /* The reference to the source info dialog */
  sourceInfoDialog?: DynamicDialogRef;

  /* The reference to the project info dialog */
  projectInfoDialog?: DynamicDialogRef;

  sidebarItems$: Observable<SidebarItem[]>;

  /* The currently selected view */
  selectedView = 'Inbox';

  /* The host OS (windows, macos, linux) */
  os = '';

  /* The route animation data, used to determine which animation to use when navigating between views */
  routeAnimationData = 'Inbox';

  /* Whether to use animations in the app or not */
  animate = true;

  proTips: MenuItem[] = [
    {
      icon: PrimeIcons.QUESTION_CIRCLE,
      command: () => this.tips.showByGroup('intro'),
      tooltipOptions: {
        tooltipLabel: 'Getting Started',
        tooltipPosition: 'right',
      },
    },
    {
      icon: PrimeIcons.DATABASE,
      command: () => this.tips.showByGroup('source'),
      tooltipOptions: {
        tooltipLabel: 'Sources',
        tooltipPosition: 'right',
      },
    },
    {
      icon: PrimeIcons.MAP,
      command: () => this.tips.showByGroup('navigation'),
      tooltipOptions: {
        tooltipLabel: 'Navigation',
        tooltipPosition: 'right',
      },
    },
    {
      icon: PrimeIcons.COMMENTS,
      command: () => this.tips.showByGroup('chat'),
      tooltipOptions: {
        tooltipLabel: 'Chat',
        tooltipPosition: 'right',
      },
    },
  ];

  /* The subject used to emit window resize events */
  private _windowResize = new BehaviorSubject({});

  /* The application component constructor - injects all the services and sets up the subscriptions */
  constructor(
    private settings: SettingsService,
    private notifications: NotificationsService,
    private startup: StartupService,
    private chat: ChatService,
    private command: KsCommandService,
    private confirm: ConfirmationService,
    private contexts: ChildrenOutletContexts,
    private dialog: DialogService,
    private dnd: DragAndDropService,
    private factory: KsFactoryService,
    private projects: ProjectService,
    private ipc: ElectronIpcService,
    private ingest: IngestService,
    private pCommand: ProjectCommandService,
    private router: Router,
    private sidebar: SidebarService,
    private themes: ThemeService,
    private tips: ProTipService
  ) {
    this.sidebarItems$ = sidebar.items$;

    /* Set window icons based on OS */
    this.settings.all
      .pipe(
        take(2),
        map((s) => s.system),
        tap((systemSettings) => {
          if (systemSettings && systemSettings.osPlatform) {
            this.os = systemSettings.osPlatform;
          }
        })
      )
      .subscribe();

    /* enable/disable animations */
    this.settings.display
      .pipe(
        map((d) => d.animations),
        tap((animations) => {
          this.animate = animations;
        })
      )
      .subscribe();

    /* Listen for route changes and update the sidebar accordingly */
    this.router.events
      .pipe(
        tap((events) => {
          if (events instanceof NavigationEnd) {
            const segments = events.url.split('/').filter((f) => f.length);
            const visibleRoute = segments[1];
            for (const view of [
              'Inbox',
              'Projects',
              'Table',
              'Grid',
              'Graph',
              'Calendar',
            ]) {
              if (visibleRoute?.includes(view.toLowerCase())) {
                this.selectedView = view;
                break;
              }
            }
            if (this.animate) {
              this.routeAnimationData = this.selectedView;
            }
          }
        })
      )
      .subscribe();

    /* Listen for Source Info Dialog events, open/close the dialog as necessary */
    this.command.ksDetailEvent
      .pipe(
        tap((ks) => {
          if (ks?.force && this.sourceInfoDialog) {
            this.sourceInfoDialog.close();
          }

          let view = 'details';
          if (ks?.view) {
            view = ks.view;
          }

          if (ks && !this.sourceInfoDialog) {
            // Hide all other elements on the page so they don't show through the dialog
            const elements = document.getElementsByClassName('app-body');
            for (let i = 0; i < elements.length; i++) {
              elements[i].classList.add('hidden');
            }

            this.sourceInfoDialog = this.dialog.open(KsDetailsComponent, {
              data: { ks: ks, view: view },
              width: '100vw !important',
              height: '100vh !important',
              styleClass: 'min-h-screen',
              maximizable: true,
              showHeader: false,
              style: { margin: 0, padding: 0, overflow: 'unset' },
              contentStyle: {
                margin: 0,
                padding: 0,
                height: '100vh',
                overflow: 'hidden',
              },
              closeOnEscape: true,
            });
            setTimeout(() => {
              if (this.sourceInfoDialog) {
                this.sourceInfoDialog.maximize({});
              }
            });
            this.sourceInfoDialog.onClose.subscribe(() => {
              this.sourceInfoDialog = undefined;

              // Show all other elements on the page
              const elements = document.getElementsByClassName('app-body');
              for (let i = 0; i < elements.length; i++) {
                elements[i].classList.remove('hidden');
              }

              /**
               * If we're on the chat view, make sure the chat service target is the current project
               * Required because the chat service will set the target to the source if the user goes
               * to the Source chat in the dialog
               */
              if (this.selectedView === 'Chat') {
                this.chat.setTarget({
                  project: this.projects.getProject(this.projectId),
                });
              }
            });
          }
        })
      )
      .subscribe();

    /* Listen for Project Info Dialog events, open/close the dialog as necessary */
    this.pCommand.detailEvent
      .pipe(
        tap((project) => {
          if (!project) {
            return;
          }
          this.projectInfoDialog = this.dialog.open(ProjectDetailsComponent, {
            data: { project: project },
            showHeader: false,
            contentStyle: {
              'border-radius': '10px',
              width: '50vw',
              'max-width': '60rem',
            },
            closeOnEscape: true,
          });
          this.projectInfoDialog.onClose
            .pipe(
              tap(() => {
                this.projectInfoDialog = undefined;
              })
            )
            .subscribe();
        })
      )
      .subscribe();

    /* Use the ingest queue to update the inbox badge on the sidebar */
    this.ingest.queue
      .pipe(
        tap((upNext) => {
          this.inboxBadge = upNext.length;
        })
      )
      .subscribe();

    /* When the project changes, update the sidebar and the project id */
    this.projects.currentProject
      .pipe(
        debounceTime(250),
        tap((project) => {
          this.projectId = project?.id.value ?? '';
          if (this.projectId && this.projectId.trim().length === 36) {
            this.sidebar.all({ value: this.projectId });
          } else {
            this.sidebar.byLabel('Inbox', { value: this.projectId });
          }
          if (
            !project ||
            !project.id.value ||
            project.id?.value === 'undefined'
          ) {
            setTimeout(() => {
              this.tips.showByGroup('intro');
            }, 1000);
          }
        })
      )
      .subscribe();

    /* Ensure the theme has been completely loaded on startup */
    this.themes.setLocal().then(() => {
      setTimeout(() => {
        this.readyToShow = true;
      }, Math.floor(Math.random() * 1000));
    });

    /* Listen for window resize events and update the sidebar visibility accordingly */
    this._windowResize
      .asObservable()
      .pipe(
        throttleTime(50),
        tap(() => {
          this.projectTreeVisible = window.innerWidth >= 1200;
        })
      )
      .subscribe();
  }

  ngOnInit() {
    this.tips.setTarget(this.proTipsOverlay, this.proTipsComponent);
  }

  /* A convenience method to open the settings dialog */
  showSettings() {
    this.settings.show();
  }

  /* When the user clicks the close button, close the window */
  close() {
    window.close();
  }

  /* When the user clicks the minimize button, send a message to the main process to minimize the window */
  minimize() {
    window.api.send('A2E:Window:Minimize');
  }

  /* When the user clicks the maximize button, send a message to the main process to maximize the window */
  maximize() {
    window.api.send('A2E:Window:Maximize');
  }

  /**
   * When the user clicks on a sidebar item, update the selected view and run the command if it exists
   * @param item The sidebar item that was clicked
   */
  onSidebarClick(item: SidebarItem) {
    if (item?.label) {
      this.selectedView =
        item.label === 'Settings' ? this.selectedView : item.label;
      if (item.command) {
        item.command();
      }
    }
  }

  /* When the window resizes, send a message to the window resize observable */
  @HostListener('window:resize', ['$event'])
  windowResize() {
    this._windowResize.next({});
  }

  /* When the user presses the refresh key, reload the page */
  @HostListener('document:keydown.Control.r', ['$event'])
  @HostListener('document:keydown.f5', ['$event'])
  @HostListener('document:keydown.meta.r', ['$event'])
  refresh(event: KeyboardEvent) {
    if (!event) {
      this.notifications.warn('App', 'Invalid Keystroke', 'Refresh');
      return;
    }
    try {
      event.preventDefault();
    } catch (e) {
      this.notifications.error(
        'App',
        'Unexpected Event',
        'Host Listener provided an invalid event for refresh command.'
      );
    }
    if (!environment.production) {
      location.reload();
    }
  }

  /* When the user presses the open projects key, toggle the project tree */
  @HostListener('document:keydown.Control.p')
  @HostListener('document:keydown.meta.p')
  keyPressOpenProjects() {
    this.projectTreeVisible = !this.projectTreeVisible;
  }

  /* When the user presses the view 1 key, go to the inbox */
  @HostListener('document:keydown.Control.1')
  @HostListener('document:keydown.meta.1')
  goInbox() {
    this.router.navigate(['app', 'inbox', this.projectId]);
  }

  /* When the user presses the view 3 key, go to the graph view */
  @HostListener('document:keydown.Control.2')
  @HostListener('document:keydown.meta.2')
  goGraph() {
    if (this.projectId.length > 0) {
      this.router.navigate(['app', 'graph', this.projectId]);
    }
  }

  /* When the user presses the view 4 key, go to the table view */
  @HostListener('document:keydown.Control.3')
  @HostListener('document:keydown.meta.3')
  goTable() {
    if (this.projectId.length > 0) {
      this.router.navigate(['app', 'table', this.projectId]);
    }
  }

  /* When the user presses the view 5 key, go to the grid view */
  @HostListener('document:keydown.Control.4')
  @HostListener('document:keydown.meta.4')
  goGrid() {
    if (this.projectId.length > 0) {
      this.router.navigate(['app', 'grid', this.projectId]);
    }
  }

  /* When the user presses the view 6 key, go to the calendar view */
  @HostListener('document:keydown.Control.5')
  @HostListener('document:keydown.meta.5')
  goCalendar() {
    if (this.projectId.length > 0) {
      this.router.navigate(['app', 'calendar', this.projectId]);
    }
  }

  @HostListener('document:keydown.Control.6')
  @HostListener('document:keydown.meta.6')
  goChat() {
    if (this.projectId.length > 0) {
      this.router.navigate(['app', 'chat', this.projectId]);
    }
  }

  /* When the user presses settings menu key, show the seettings dialog */
  @HostListener('document:keydown.Control.,')
  @HostListener('document:keydown.meta.,')
  goSettings() {
    this.showSettings();
  }

  @HostListener('document:keydown.Control./')
  @HostListener('document:keydown.meta./')
  goProTips() {
    // Get current view from router and show tips for that view
    const currentView = this.router.url.split('/')[2];
    console.log('Attempting to show tips for ' + currentView);

    if (!currentView.startsWith('(')) {
      this.tips.showByGroup(currentView);
    }
  }

  /* Use prevent default to allow drag and drop to work properly */
  @HostListener('dragover', ['$event']) onDragOver(evt: any) {
    evt.preventDefault();
  }

  /**
   * Handle the drop event by parsing the drag event and then importing any resultant sources
   * @param event
   */
  @HostListener('drop', ['$event']) handleDrop(event: DragEvent) {
    this.dnd
      .parseDragEvent(event)
      .then((ksReq) => {
        if (ksReq) {
          this.factory.many(ksReq).then((ksList) => {
            if (ksList.length > 0) {
              ksList.forEach((ks) => (ks.importMethod = 'dnd'));

              if (this.selectedView === 'Inbox') {
                // If in the inbox, add to ingest queue
                this.ingest.enqueue(ksList);
              } else if (this.projectId) {
                // Otherwise add directly to the active project
                const update: ProjectUpdateRequest = {
                  id: { value: this.projectId },
                  addKnowledgeSource: ksList,
                };
                this.projects.updateProjects([update]);
              }
            }
          });
        }
      })
      .catch((reason) => {
        this.notifications.error('App', 'Unexpected Error', reason);
      });
  }
}
