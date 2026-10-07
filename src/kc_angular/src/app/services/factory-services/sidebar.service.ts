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
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { UUID } from '@shared/models/uuid.model';

export type SidebarItem = {
  label: string;
  routerLink?: any;
  command?: any;
  icon: string;
  tipMessage: string;
  tipHeader: string;
};

const SIDEBAR_ITEMS: SidebarItem[] = [
  {
    label: 'Inbox',
    routerLink: ['app', 'inbox', 'undefined'],
    icon: 'pi pi-inbox',
    tipHeader: 'Your Control Center! (⌘/Ctrl + 1)',
    tipMessage: `Consider the Inbox a staging area for new sources. It allows you to view and chat with sources before assigning them to a project. When ready, simply drag-and-drop them into your chosen project in the project tree. It's your sources, your way!`,
  },
  {
    label: 'Graph',
    routerLink: ['app', 'graph', 'undefined'],
    icon: 'pi pi-sitemap',
    tipHeader: 'Visualize the Magic! (⌘/Ctrl + 2)',
    tipMessage:
      'Craving some visual aid? Our Graph view artfully maps your project structure and source connections. Hunt for sources and watch the web of knowledge unfold!',
  },
  {
    label: 'Table',
    routerLink: ['app', 'table', 'undefined'],
    icon: 'pi pi-table',
    tipHeader: 'Tabulate! (⌘/Ctrl + 3)',
    tipMessage:
      'Fancy some order? Our Table view neatly aligns your sources, perfect for viewing, editing, and bulk actions. Say hello to your data in a whole new way!',
  },
  {
    label: 'Grid',
    routerLink: ['app', 'grid', 'undefined'],
    icon: 'pi pi-th-large',
    tipHeader: 'Get Griddy! (⌘/Ctrl + 4)',
    tipMessage: `Love quick scans? Our Grid view displays your sources as cards with all the trimmings. It's a visual feast for your data appetite!`,
  },
  {
    label: 'Calendar',
    routerLink: ['app', 'calendar', 'undefined'],
    icon: 'pi pi-calendar',
    tipHeader: 'Time Travel, Anyone? (⌘/Ctrl + 5)',
    tipMessage:
      'Curious about your progress? Our Calendar view tracks your activity over time. Perfect for learning, tracking, and time-lining your data journey.',
  },
  {
    label: 'Chat',
    routerLink: ['app', 'chat', 'undefined'],
    icon: 'pi pi-comments',
    tipHeader: `Let's Chit-Chat! (⌘/Ctrl + 6)`,
    tipMessage:
      'Fancy a chat with your Projects and Sources? Our Chat view, powered by large language models, makes exploring concepts a fun conversation.',
  },
];

@Injectable({
  providedIn: 'root',
})
export class SidebarService {
  private items = new BehaviorSubject<SidebarItem[]>([SIDEBAR_ITEMS[0]]);

  items$ = this.items.asObservable();

  constructor(private platform: Platform) {}

  all(projectId: UUID) {
    const items = SIDEBAR_ITEMS.filter(
      (i) => i.label !== 'Chat' || this.platform.has('chat')
    ).map((i) => {
      i.routerLink[2] = projectId.value;
      return i;
    });
    this.items.next(items);
  }

  byLabel(label: string, projectId: UUID) {
    const item = SIDEBAR_ITEMS.filter((i) => i.label === label);
    item[0].routerLink[2] = projectId;
    this.items.next(item);
  }
}
