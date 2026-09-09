/**
 * campaigns.controller.js — Earner campaign browser controller.
 *
 * Loads the list of active campaigns from the backend and renders them
 * as cards. Each card shows the campaign type, reward per action, asset,
 * and remaining budget. A "Participate" button requires wallet connection.
 */

'use strict';

angular.module('flareApp.earner', ['flareApp.stellar', 'flareApp.wallet', 'flareApp.auth'])
  .controller('CampaignsCtrl', [
    '$scope',
    'StellarService',
    'WalletService',
    'AuthService',
    function ($scope, StellarService, WalletService, AuthService) {

      $scope.campaigns = [];
      $scope.loading = true;
      $scope.error = null;
      $scope.walletConnected = false;

      // ── Initialise ────────────────────────────────────────────────────────

      WalletService.isConnected().then(function (connected) {
        $scope.walletConnected = connected;
      }).catch(angular.noop);

      StellarService.getCampaigns()
        .then(function (campaigns) {
          $scope.campaigns = campaigns || [];
        })
        .catch(function (err) {
          $scope.error = 'Failed to load campaigns. Please try again later.';
          console.error('[CampaignsCtrl] getCampaigns error:', err);
        })
        .finally(function () {
          $scope.loading = false;
        });

      // ── Helpers ───────────────────────────────────────────────────────────

      /**
       * Human-readable label for campaign types from the CampaignType enum.
       *
       * @param {string} type - One of: Referral, Social, LearnToEarn, AdAttention
       * @returns {string}
       */
      $scope.campaignTypeLabel = function (type) {
        var labels = {
          Referral: '🔗 Referral',
          Social: '📣 Social Sharing',
          LearnToEarn: '🎓 Learn-to-Earn',
          AdAttention: '👁️ Ad Attention',
        };
        return labels[type] || type;
      };

      /**
       * Format a Stellar asset address to a short display form.
       *
       * @param {string} asset - Full asset contract address
       * @returns {string}
       */
      $scope.shortAsset = function (asset) {
        if (!asset) return '—';
        return asset.length > 12
          ? asset.slice(0, 6) + '…' + asset.slice(-4)
          : asset;
      };

      /**
       * Initiate participation. Requires wallet connection.
       * Full per-module participation UI is wired up post Day 5.
       *
       * @param {Object} campaign
       */
      $scope.participate = function (campaign) {
        if (!$scope.walletConnected) {
          WalletService.connect()
            .then(function () {
              $scope.walletConnected = true;
              alert('Wallet connected! Participation flow coming soon for: ' + campaign.id);
            })
            .catch(function (err) {
              console.error('[CampaignsCtrl] connect error:', err);
            });
          return;
        }
        // Placeholder — full participation flows wired post Day 5
        alert('Participate in campaign: ' + campaign.id);
      };
    },
  ]);
