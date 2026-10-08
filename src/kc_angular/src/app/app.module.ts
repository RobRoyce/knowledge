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
import { A11yModule } from '@angular/cdk/a11y';
import { AccordionModule } from 'primeng/accordion';
import { AppComponent } from '@app/app.component';
import { AppRoutingModule } from '@app/app-routing.module';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { BadgeModule } from 'primeng/badge';
import { BlockUIModule } from 'primeng/blockui';
import { BreadcrumbModule } from 'primeng/breadcrumb';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserViewComponent } from '@components/source-components/ks-viewport/browser-view.component';
import { ButtonModule } from 'primeng/button';
import { CalendarComponent } from '@components/calendar.component';
import { CalendarModule } from 'primeng/calendar';
import { CardModule } from 'primeng/card';
import { ChartModule } from 'primeng/chart';
import { ChatApiComponent } from '@components/chat-components/api.component';
import { ChatActionsComponent } from '@components/chat-components/chat.actions.component';
import { ChatComponent } from '@components/chat.component';
import { ChatMessageComponent } from '@components/chat-components/chat.message.component';
import { ChatToolbarComponent } from '@components/chat-components/chat.toolbar.component';
import { ChatViewComponent } from '@components/chat-components/chat.view.component';
import { CheckboxModule } from 'primeng/checkbox';
import { ChipModule } from 'primeng/chip';
import { ChipsModule } from 'primeng/chips';
import { ClipboardModule } from '@angular/cdk/clipboard';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmPopupModule } from 'primeng/confirmpopup';
import {
  ConfirmationService,
  MessageService,
  TreeDragDropService,
} from 'primeng/api';
import { ContextMenuModule } from 'primeng/contextmenu';
import { CountdownPipe } from '@pipes/countdown.pipe';
import { CreateComponent } from '@components/shared/create.component';
import { DataViewModule } from 'primeng/dataview';
import { DialogModule } from 'primeng/dialog';
import { DialogService } from 'primeng/dynamicdialog';
import { DisplaySettingsComponent } from '@components/settings/display-settings.component';
import { DividerModule } from 'primeng/divider';
import { DropdownModule } from 'primeng/dropdown';
import { FileUploadModule } from 'primeng/fileupload';
import { FileViewComponent } from '@components/source-components/ks-viewport/file-view.component';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { FullCalendarModule } from '@fullcalendar/angular';
import { GraphCanvasComponent } from '@components/graph-components/graph.canvas.component';
import { GraphComponent } from '@components/graph.component';
import { GraphControlsComponent } from '@components/graph-components/graph.controls.component';
import { GraphSearchComponent } from '@components/graph-components/graph-search.component';
import { GraphSettingsComponent } from '@components/settings/graph-settings.component';
import { GraphStatusComponent } from '@components/graph-components/graph.status';
import { GridComponent } from '@components/grid.component';
import { HistoryComponent } from '@components/history.component';
import { HomeComponent } from '@components/home.component';
import { HttpClientModule } from '@angular/common/http';
import { ImageModule } from 'primeng/image';
import { ImportMethodPipe } from '@pipes/import-method.pipe';
import { IngestService } from '@services/ingest-services/ingest.service';
import { IngestSettingsComponent } from '@components/settings/ingest-settings.component';
import { InputSwitchModule } from 'primeng/inputswitch';
import { InputTextModule } from 'primeng/inputtext';
import { InputTextareaModule } from 'primeng/inputtextarea';
import { KsActionsComponent } from '@components/source-components/ks-actions.component';
import { KsCardComponent } from '@components/source-components/ks-card.component';
import { KsCardListComponent } from '@components/source-components/ks-card-list.component';
import { KsDetailsComponent } from '@components/source-components/ks-details.component';
import { KsDropzoneComponent } from '@components/source-components/ks-dropzone.component';
import { KsExportComponent } from '@components/source-components/ks-export.component';
import { KsIconComponent } from '@components/source-components/ks-icon.component';
import { KsIngestTypeIconPipe } from '@pipes/ks-ingest-type-icon.pipe';
import { KsMessageComponent } from '@components/source-components/ks-message.component';
import { KsPreviewComponent } from '@components/source-components/ks-preview.component';
import { KsTableComponent } from '@components/source-components/ks-table.component';
import { KsThumbnailComponent } from '@components/source-components/ks-thumbnail.component';
import { MarkdownPipe } from '@pipes/markdown.pipe';
import { MenuModule } from 'primeng/menu';
import { MenubarModule } from 'primeng/menubar';
import { MultiSelectModule } from 'primeng/multiselect';
import { NgModule } from '@angular/core';
import { OrganizationChartModule } from 'primeng/organizationchart';
import { OverlayModule } from '@angular/cdk/overlay';
import { OverlayPanelModule } from 'primeng/overlaypanel';
import { PaginatorModule } from 'primeng/paginator';
import { PanelModule } from 'primeng/panel';
import { PickListModule } from 'primeng/picklist';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ProjectAsTreeNodePipe } from '@pipes/project-as-tree-node.pipe';
import { ProjectBreadcrumbComponent } from '@components/project-components/project-breadcrumb.component';
import { ProjectBreadcrumbPipe } from '@pipes/project-breadcrumb.pipe';
import { ProjectCalendarComponent } from '@components/project-components/project-calendar.component';
import { ProjectCreationDialogComponent } from '@components/project-components/project-creation-dialog.component';
import { ProjectDetailsComponent } from '@components/project-components/project-details.component';
import { ProjectNamePipe } from '@pipes/project-name.pipe';
import { ProjectSelectorComponent } from '@components/project-components/project-selector.component';
import { ProjectService } from '@services/factory-services/project.service';
import { ProjectsTreeComponent } from '@components/project-components/projects-tree.component';
import { RadioButtonModule } from 'primeng/radiobutton';
import { ScrollPanelModule } from 'primeng/scrollpanel';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { SearchComponent } from '@components/search.component';
import { SearchSettingsComponent } from '@components/settings/search-settings.component';
import { SelectButtonModule } from 'primeng/selectbutton';
import { SettingTemplateComponent } from '@components/settings/setting-template.component';
import { SettingsComponent } from '@components/settings/settings.component';
import { SettingsService } from '@services/ipc-services/settings.service';
import { SidebarModule } from 'primeng/sidebar';
import { SkeletonModule } from 'primeng/skeleton';
import { SliderModule } from 'primeng/slider';
import { SpeedDialModule } from 'primeng/speeddial';
import { SplitButtonModule } from 'primeng/splitbutton';
import { SplitterModule } from 'primeng/splitter';
import { StorageSettingsComponent } from '@components/settings/storage-settings.component';
import { StyleClassModule } from 'primeng/styleclass';
import { SwitchLabelPipe } from '@pipes/switch-label.pipe';
import { TabViewModule } from 'primeng/tabview';
import { TableComponent } from '@components/table.component';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TimelineComponent } from '@components/shared/timeline.component';
import { TimelineModule } from 'primeng/timeline';
import { ToastModule } from 'primeng/toast';
import { ToggleButtonModule } from 'primeng/togglebutton';
import { TooltipModule } from 'primeng/tooltip';
import { TreeModule } from 'primeng/tree';
import { TreeSelectModule } from 'primeng/treeselect';
import { TruncatePipe } from '@pipes/truncate.pipe';
import { ViewIconPipe } from '@pipes/view-icon.pipe';
import { ViewportHeaderComponent } from '@components/source-components/ks-viewport/viewport-header.component';
import { YouTubePlayerModule } from '@angular/youtube-player';
import { LoadingComponent } from '@components/shared/loading.component';
import { ChatSettingsComponent } from '@components/settings/chat-settings.component';
import { RecreateViewDirective } from './directives/recreate-view.directive';
import { SourceComponent } from '@components/source-components/source.component';
import { SourceDetailsComponent } from '@components/source-components/source.details.component';
import { SourceChatComponent } from '@components/source-components/source.chat.component';
import { SourceVideoComponent } from '@components/source-components/source.video.component';
import { SourceDocumentComponent } from '@components/source-components/source.document.component';
import { SourceTimelineComponent } from '@components/source-components/source.timeline.component';
import { IconComponent } from '@components/shared/icon.component';
import { DragDropModule } from 'primeng/dragdrop';
import { SanitizeHtmlPipe } from '@pipes/sanitize-html.pipe';
import { SourceBrowserComponent } from '@components/source-components/source.browser.component';
import { SourceNoteComponent } from '@components/source-components/source-note.component';
import { ProTipDirective } from './directives/pro-tip.directive';
import { ProTipsComponent } from '@components/shared/pro-tips.component';
import { ChatInputComponent } from '@components/chat-components/chat.input.component';
import { WebImportComponent } from '@components/shared/web.import.component';
import { MessageModule } from 'primeng/message';
import { QuizMessage } from '@components/chat-components/message-templates/quiz.message';
import { CategorizeMessage } from '@components/chat-components/message-templates/categorize.message';
import { TreeTableModule } from 'primeng/treetable';
import { TopicMessage } from '@components/chat-components/message-templates/topic.message';
import { ChatMessageDirective } from './directives/chat-message.directive';
import { CarouselModule } from 'primeng/carousel';

@NgModule({
  declarations: [
    AppComponent,
    BrowserViewComponent,
    CalendarComponent,
    ChatActionsComponent,
    ChatApiComponent,
    ChatComponent,
    ChatInputComponent,
    ChatMessageComponent,
    ChatSettingsComponent,
    ChatViewComponent,
    CountdownPipe,
    CreateComponent,
    DisplaySettingsComponent,
    FileViewComponent,
    GraphCanvasComponent,
    GraphComponent,
    GraphControlsComponent,
    GraphSearchComponent,
    GraphSettingsComponent,
    GraphStatusComponent,
    GridComponent,
    HistoryComponent,
    HomeComponent,
    ImportMethodPipe,
    IngestSettingsComponent,
    KsActionsComponent,
    KsCardComponent,
    KsCardListComponent,
    KsDetailsComponent,
    KsDropzoneComponent,
    KsExportComponent,
    KsIconComponent,
    KsIngestTypeIconPipe,
    KsMessageComponent,
    KsPreviewComponent,
    KsTableComponent,
    KsThumbnailComponent,
    LoadingComponent,
    ProjectAsTreeNodePipe,
    ProjectBreadcrumbComponent,
    ProjectBreadcrumbPipe,
    ProjectCalendarComponent,
    ProjectCreationDialogComponent,
    ProjectDetailsComponent,
    ProjectNamePipe,
    ProjectSelectorComponent,
    ProjectsTreeComponent,
    SearchComponent,
    SearchSettingsComponent,
    SettingTemplateComponent,
    SettingsComponent,
    StorageSettingsComponent,
    SwitchLabelPipe,
    TableComponent,
    TimelineComponent,
    TruncatePipe,
    ViewIconPipe,
    ViewportHeaderComponent,
    ChatToolbarComponent,
    MarkdownPipe,
    RecreateViewDirective,
    SourceComponent,
    SourceDetailsComponent,
    SourceChatComponent,
    SourceVideoComponent,
    SourceBrowserComponent,
    SourceNoteComponent,
    SourceDocumentComponent,
    SourceTimelineComponent,
    IconComponent,
    SanitizeHtmlPipe,
    ProTipDirective,
    ProTipsComponent,
    WebImportComponent,
    QuizMessage,
    CategorizeMessage,
    TopicMessage,
    ChatMessageDirective,
  ],
  imports: [
    A11yModule,
    AccordionModule,
    AppRoutingModule,
    AutoCompleteModule,
    BadgeModule,
    BlockUIModule,
    BreadcrumbModule,
    BrowserAnimationsModule,
    BrowserModule,
    ButtonModule,
    CalendarModule,
    CardModule,
    ChartModule,
    CheckboxModule,
    ChipModule,
    ChipsModule,
    ClipboardModule,
    ConfirmDialogModule,
    ConfirmPopupModule,
    ContextMenuModule,
    DataViewModule,
    DialogModule,
    DividerModule,
    DragDropModule,
    DropdownModule,
    FileUploadModule,
    FormsModule,
    FullCalendarModule,
    HttpClientModule,
    ImageModule,
    InputSwitchModule,
    InputTextModule,
    InputTextareaModule,
    MenuModule,
    MenubarModule,
    MultiSelectModule,
    OrganizationChartModule,
    OverlayModule,
    OverlayPanelModule,
    PaginatorModule,
    PanelModule,
    PickListModule,
    ProgressSpinnerModule,
    RadioButtonModule,
    ReactiveFormsModule,
    ScrollPanelModule,
    ScrollingModule,
    SelectButtonModule,
    SidebarModule,
    SkeletonModule,
    SliderModule,
    SpeedDialModule,
    SplitButtonModule,
    SplitterModule,
    StyleClassModule,
    TabViewModule,
    TableModule,
    TagModule,
    TimelineModule,
    ToastModule,
    ToggleButtonModule,
    TooltipModule,
    TreeModule,
    TreeSelectModule,
    YouTubePlayerModule,
    DragDropModule,
    MessageModule,
    TreeTableModule,
    CarouselModule,
  ],
  providers: [
    ConfirmationService,
    DialogService,
    IngestService,
    MessageService,
    ProjectService,
    SettingsService,
    TreeDragDropService,
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}

declare global {
  interface Window {
    api?: any;
    electron?: any;
  }
}
