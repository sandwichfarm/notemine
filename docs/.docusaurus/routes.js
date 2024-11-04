import React from 'react';
import ComponentCreator from '@docusaurus/ComponentCreator';

export default [
  {
    path: '/markdown-page',
    component: ComponentCreator('/markdown-page', '3d7'),
    exact: true
  },
  {
    path: '/',
    component: ComponentCreator('/', 'e5f'),
    exact: true
  },
  {
    path: '/',
    component: ComponentCreator('/', '9bc'),
    routes: [
      {
        path: '/',
        component: ComponentCreator('/', '366'),
        routes: [
          {
            path: '/',
            component: ComponentCreator('/', '0e4'),
            routes: [
              {
                path: '/api/package-name/',
                component: ComponentCreator('/api/package-name/', 'fe0'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/api/package-name/classes/Notemine',
                component: ComponentCreator('/api/package-name/classes/Notemine', 'bf0'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/api/package-name/interfaces/BestPowData',
                component: ComponentCreator('/api/package-name/interfaces/BestPowData', '34e'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/api/package-name/interfaces/CancelledEvent',
                component: ComponentCreator('/api/package-name/interfaces/CancelledEvent', '884'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/api/package-name/interfaces/ErrorEvent',
                component: ComponentCreator('/api/package-name/interfaces/ErrorEvent', 'a79'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/api/package-name/interfaces/MinedResult',
                component: ComponentCreator('/api/package-name/interfaces/MinedResult', 'dc3'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/api/package-name/interfaces/MinerOptions',
                component: ComponentCreator('/api/package-name/interfaces/MinerOptions', 'cae'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/api/package-name/interfaces/ProgressEvent',
                component: ComponentCreator('/api/package-name/interfaces/ProgressEvent', '85a'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/api/package-name/interfaces/SuccessEvent',
                component: ComponentCreator('/api/package-name/interfaces/SuccessEvent', 'bc8'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/api/package-name/interfaces/WorkerPow',
                component: ComponentCreator('/api/package-name/interfaces/WorkerPow', 'e1d'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/api/wrapper/',
                component: ComponentCreator('/api/wrapper/', 'eaa'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/api/wrapper/classes/Notemine',
                component: ComponentCreator('/api/wrapper/classes/Notemine', 'e07'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/api/wrapper/interfaces/BestPowData',
                component: ComponentCreator('/api/wrapper/interfaces/BestPowData', 'f6a'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/api/wrapper/interfaces/CancelledEvent',
                component: ComponentCreator('/api/wrapper/interfaces/CancelledEvent', '483'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/api/wrapper/interfaces/ErrorEvent',
                component: ComponentCreator('/api/wrapper/interfaces/ErrorEvent', 'c57'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/api/wrapper/interfaces/MinedResult',
                component: ComponentCreator('/api/wrapper/interfaces/MinedResult', '9dc'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/api/wrapper/interfaces/MinerOptions',
                component: ComponentCreator('/api/wrapper/interfaces/MinerOptions', '4bf'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/api/wrapper/interfaces/ProgressEvent',
                component: ComponentCreator('/api/wrapper/interfaces/ProgressEvent', '6dd'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/api/wrapper/interfaces/SuccessEvent',
                component: ComponentCreator('/api/wrapper/interfaces/SuccessEvent', 'b44'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/api/wrapper/interfaces/WorkerPow',
                component: ComponentCreator('/api/wrapper/interfaces/WorkerPow', 'a0e'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/packages/',
                component: ComponentCreator('/packages/', 'b86'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/packages/core',
                component: ComponentCreator('/packages/core', '300'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/packages/reactjs',
                component: ComponentCreator('/packages/reactjs', '676'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/packages/rust',
                component: ComponentCreator('/packages/rust', '14b'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/packages/svelte',
                component: ComponentCreator('/packages/svelte', '474'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/packages/wrapper',
                component: ComponentCreator('/packages/wrapper', '681'),
                exact: true,
                sidebar: "tutorialSidebar"
              }
            ]
          }
        ]
      }
    ]
  },
  {
    path: '*',
    component: ComponentCreator('*'),
  },
];
