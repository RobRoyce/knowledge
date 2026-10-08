/*
 * Copyright (c) 2023-2024 Rob Royce
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
/// <reference lib="dom" />

import { ProjectTreeNode } from '../models/project.tree.model';
import { TreeNode } from 'primeng/api';

export function constructTreeNodes(
  nodes: ProjectTreeNode[],
  collapsed: boolean,
  parent?: TreeNode
) {
  const treeNodes: TreeNode[] = [];
  for (const node of nodes) {
    const treeNode: TreeNode = {
      label: node.name,
      leaf: node.subprojects.length === 0,
      selectable: true,
      draggable: true,
      parent: parent,
      droppable: true,
      key: node.id,
      icon: node.icon,
    };
    treeNode.children =
      node.subprojects.length > 0
        ? constructTreeNodes(node.subprojects, collapsed, treeNode)
        : [];
    treeNodes.push(treeNode);
  }
  return treeNodes;
}

addEventListener('message', (msg) => {
  if (!msg.data || !msg.data.nodes) {
    return;
  }

  const nodes = msg.data.nodes;
  const collapsed = msg.data.collapsed;
  const parent = msg.data.parent;
  const constructed = constructTreeNodes(nodes, collapsed, parent);
  postMessage(constructed);
});
