/**
 * app.routes.js — ui-router state definitions for Flare Protocol.
 *
 * Defines all routes for the Advertiser and Earner portals.
 * The default state redirects to the earner campaign browser.
 */

'use strict';

angular.module('flareApp').config([
  '$stateProvider',
  '$urlRouterProvider',
  function ($stateProvider, $urlRouterProvider) {

    // Default redirect
    $urlRouterProvider.otherwise('/earner/campaigns');

    $stateProvider

      // ── Earner portal ──────────────────────────────────────────────────
      .state('earner', {
        abstract: true,
        url: '/earner',
        template: '<div ui-view></div>',
      })

      .state('earner.campaigns', {
        url: '/campaigns',
        templateUrl: 'app/earner/campaigns/campaigns.html',
        controller: 'CampaignsCtrl',
      })

      .state('earner.dashboard', {
        url: '/dashboard',
        templateUrl: 'app/earner/dashboard/dashboard.html',
        controller: 'DashboardCtrl',
      })

      .state('earner.earnings', {
        url: '/earnings',
        templateUrl: 'app/earner/earnings/earnings.html',
        controller: 'EarningsCtrl',
      })

      // ── Advertiser portal ──────────────────────────────────────────────
      .state('advertiser', {
        abstract: true,
        url: '/advertiser',
        template: '<div ui-view></div>',
      })

      .state('advertiser.dashboard', {
        url: '/dashboard',
        templateUrl: 'app/advertiser/dashboard/dashboard.html',
        controller: 'AdvertiserDashCtrl',
      })

      .state('advertiser.create', {
        url: '/create-campaign',
        templateUrl: 'app/advertiser/create-campaign/create.html',
        controller: 'CreateCampaignCtrl',
      })

      .state('advertiser.analytics', {
        url: '/analytics',
        templateUrl: 'app/advertiser/analytics/analytics.html',
        controller: 'AnalyticsCtrl',
      });
  },
]);
