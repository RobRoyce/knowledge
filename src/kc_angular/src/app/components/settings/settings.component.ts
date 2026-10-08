/*
 * Copyright (c) 2023 Rob Royce
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
import { Platform } from '@app/platform/platform';
import { Component } from '@angular/core';
import { MenuItem } from 'primeng/api';

@Component({
  selector: 'app-settings',
  template: `
    <div
      class="h-full w-full flex flex-column align-items-center justify-content-center"
    >
      <div class="grid h-full w-full">
        <div class="col-3 lg:col-2">
          <p-menu
            [model]="modules"
            class="h-full w-full p-fluid"
            styleClass="h-full w-full p-0"
          ></p-menu>
        </div>
        <div class="col h-full overflow-y-auto">
          <router-outlet name="settings"></router-outlet>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      ::ng-deep {
        .p-menuitem-link-active {
          background-color: var(--primary-color) !important;

          .p-menuitem-icon,
          .p-menuitem-text {
            color: var(--primary-color-text) !important;
          }
        }
      }
    `,
  ],
})
export class SettingsComponent {
  constructor(private platform: Platform) {
    // Import (watched folders, extensions) and Chat are desktop features
    this.modules = this.modules.filter(
      (m) =>
        (m.label !== 'Import' || platform.has('importSettings')) &&
        (m.label !== 'Chat' || platform.has('chat'))
    );
  }

  modules: MenuItem[] = [
    {
      label: 'Display',
      icon: 'pi pi-fw pi-image',
      routerLinkActiveOptions: {},
      routerLink: ['app', { outlets: { settings: ['display'] } }],
    },
    {
      label: 'Search',
      icon: 'pi pi-fw pi-search',
      routerLink: ['app', { outlets: { settings: ['search'] } }],
    },
    {
      label: 'Import',
      icon: 'pi pi-fw pi-arrow-circle-down',
      routerLink: ['app', { outlets: { settings: ['import'] } }],
    },
    {
      label: 'Graph',
      icon: 'pi pi-fw pi-sitemap',
      routerLink: ['app', { outlets: { settings: ['graph'] } }],
    },
    {
      label: 'Chat',
      icon: 'pi pi-fw pi-comments',
      routerLink: ['app', { outlets: { settings: ['chat'] } }],
    },
    {
      label: 'Backup',
      icon: 'pi pi-fw pi-database',
      routerLink: ['app', { outlets: { settings: ['storage'] } }],
    },
  ];
}
