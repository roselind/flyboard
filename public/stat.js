/**
* Created by sly on 14-6-27.
*/

'use strict';

var periodTypes = [
    {
        text: 'TODAY',
        value: '0,0'
    },
    {
        text: 'YESTERDAY',
        value: '1,1'
    },
    {
        text: '7_DAYS',
        value: '0,6'
    },
    {
        text: '30_DAYS',
        value: '0,29'
    },
    {
        text: '90_DAYS',
        value: '0,89'
    },
    {
        text: '180_DAYS',
        value: '0,179'
    },
    {
        text: '360_DAYS',
        value: '0,359'
    },
    {
        text: 'ALL_DAYS',
        value: 'all'
    }
];

/************************** App modlue *****************************/

var statApp = angular.module('statApp', [
    'ngRoute',
    'services',
    'directives',
    'translate'
]);

statApp.config(['$routeProvider',
function ($routeProvider) {
    $routeProvider
        .when('/', {
            templateUrl: '/public/src/stat.html',
            controllers: 'StatCtrl'
        });
}]);

statApp.controller('StatNavCtrl', ['$scope', '$rootScope', '$routeParams', '$location', 'DataSource', 'Project', '$route', 'Message',
    function($scope, $rootScope, $routeParams, $location, DataSource, Project, $route, Message){
        $scope.selectedDataSources = [];
        $scope.dataSources = DataSource.query();
        $scope.periodTypes = periodTypes;
        $scope.customPeriod = null;
        $scope.selectedPeriod = null;

        function init () {
            if($routeParams.projectId) {
                $scope.project = Project.get({
                    id: parseInt($routeParams.projectId, 10)
                });
            }
            else{
                $scope.project = Project.query().$promise.then(function (projects) {
                    projects = projects || [];

                    if(projects.length){
                        $location.search('projectId', projects[0].id);
                    }

                    return projects.length > 0 ? projects[0] : null;
                });
            }

            if($routeParams.period){
                var flag = periodTypes.some(function(p){
                    if(p.value === $routeParams.period){
                        $scope.selectedPeriod = p.value;
                        return true;
                    }
                });

                if(!flag){
                    $scope.customPeriod = parseInt($routeParams.period.split(',')[1], 10) + 1;
                }
            }

            DataSource.query({
                project_id: $routeParams.projectId
            }).$promise.then(function (dataSources) {
                $scope.dataSources = dataSources;
                $scope.dataSourceMap = angular.copy(dataSources).reduce(function (memo, curr) {
                    memo[curr.id] = curr;
                    return memo;
                }, {});

                $scope.dataInfos = $route.current.params.dataInfos ? JSON.parse($route.current.params.dataInfos) : [];
            });
        }

        init();
        $scope.$on('$routeChangeSuccess', init);

        $scope.isSelectedDataSource = function(dataSource){
            return $scope.selectedDataSources.some(function(ds){
                if(dataSource.id === ds.id){
                    return true;
                }
            });

        };

        $scope.addContrastDataSource = function () {
            $scope.dataInfos = $scope.dataInfos || [];

            $scope.dataInfos.push({
                id: null,
                dimensions: []
            });
        };

        $scope.delContrastDataSource = function (dataInfo) {
            var idx = $scope.dataInfos.indexOf(dataInfo);
            if (idx === -1) {
                return;
            }
            $scope.dataInfos.splice(idx, 1);
        };

        $scope.submitChange = function () {
            $scope.dataInfos = $scope.dataInfos.filter(function(dataInfo){
                return dataInfo.id !== null;
            });

            var alarmDataSources = $scope.dataInfos.map(function (dataInfo) {
                if(!dataInfo.dimensions && dataInfo.dimensions.length === 0) {
                    return ;
                }

                var flag = dataInfo.dimensions.some(function (dimension) {
                    if(!dimension.value || ($scope.dataInfos.length > 1 && dimension.value === 'ignore')){
                        return true;
                    }
                });

                return flag ? $scope.dataSourceMap[dataInfo.id].name : null;
            }).filter(function(dataSourceName){
                return dataSourceName !== null;
            });

            if(alarmDataSources.length){
                var msg = '"' + '<b>' + alarmDataSources.join(',') + '</b>' + '"' + '<span>{{ "DIMENSION_NO_VALUE" | translate }}</span>';

                Message.alert(msg);
                return ;
            }

            $location.search('dataInfos', JSON.stringify($scope.dataInfos));
        };

        $scope.resetDataSource = function(dataSource, oldDataSource){
            if($scope.isSelectedDataSource(dataSource)){
                return ;
            }

            var idx = $scope.selectedDataSources.indexOf(oldDataSource);
            if(idx === -1){
                return ;
            }

            $scope.selectedDataSources[idx] = dataSource;
        };

        $scope.setPeriod = function(period){
            $scope.selectedPeriod = period;
            $location.search('period', period);
        };

        $scope.setCustomPeriod = function (){
            var period = 'all';
            if($scope.customPeriod && !isNaN(parseInt($scope.customPeriod, 10))){
                period = '0,' + (parseInt($scope.customPeriod, 10) - 1);
            }

            $location.search('period', period);
        };
    }
]);

statApp.controller('StatCtrl', ['$scope', '$routeParams', '$location', '$http', 'DataSource', 'RecordMultiple',
    function ($scope, $routeParams, $location, $http, DataSource, RecordMultiple) {
        if(!$routeParams.dataInfos){
            return ;
        }

        if(!$routeParams.period){
            $location.search('period', '0,6');
        }

        $scope.dataInfos = JSON.parse($routeParams.dataInfos);
        $scope.isDataReady = false;

        $scope.widget = {};
        $scope.widget.config = {
            name: '',
            reloadInterval: 600000,
            period: $routeParams.period
        };

        DataSource.query().$promise.then(function (dataSources) {
            $scope.dataSources = dataSources;
            $scope.dataSourceMap = angular.copy(dataSources).reduce(function (memo, curr) {
                memo[curr.id] = curr;
                return memo;
            }, {});

            $scope.widget.config.dataInfos = $scope.dataInfos;

            function requestData (config, opts){
                opts = opts || {};

                var query = {
                    data_infos: JSON.stringify(config.dataInfos),
                    period: config.period
                };

                if(opts.sort){
                    query.sort = opts.sort;
                }
                if(opts.exportation){
                    query.exportation = opts.exportation;
                }

                if(opts.invalid_value){
                    query.invalid_value = opts.invalid_value;
                }

                return RecordMultiple.query(query).$promise
                    .then(function (rets){
                        return rets;
                    });
            }

            function drawWidget(config) {

                $('.stat-chart').each(function () {
                    Highcharts.setOptions({
                        global: {
                            useUTC: false
                        }
                    });

                    var $container = $(this).find('.content');
                    config.dataInfos = config.dataInfos || [];

                    //request data
                    function request() {
                        var dataPromise = requestData(config, {
                            invalid_value: '--'
                        });

                        return dataPromise.then(function (formatedRespLists){
                            return formatedRespLists.map(function (formatedRespList, idx){
                                var lineOpt = {};
                                var dataInfo = $scope.dataInfos.length === 1 ? $scope.dataInfos[0] : $scope.dataInfos[idx];
                                lineOpt.name = formatedRespList.dataSource.name + additionalLabel(dataInfo, formatedRespList.records);
                                idx = idx >= defaultColors.length ? (idx % defaultColors.length) : idx;
                                lineOpt.color = defaultColors[idx];
                                lineOpt.data = [];

                                formatedRespList.records.reverse().forEach(function (record) {
                                    lineOpt.data.push({
                                        x: getTimeFromRecord(record),
                                        y: record.value
                                    });
                                });

                                return lineOpt;
                            });
                        });
                    }

                    var promises = request();

                    promises.then(function (lineOpts) {
                        var dataSeries = lineOpts || [];

                        //init chart
                        $container.highcharts({
                            chart: {
                                type: 'spline',
                                animation: Highcharts.svg, // don't animate in old IE
                                marginRight: 10,
                                events: {
                                    load: function () {

                                    }
                                }
                            },
                            title: {
                                text: ''
                            },
                            xAxis: {
                                type: 'datetime',
                                tickPixelInterval: 150,
                                lineColor: 'rgb(102, 108, 103)'
                            },
                            yAxis: {
                                title: null,
                                gridLineColor: 'rgb(102, 108, 103)',
                                plotLines: [
                                    {
                                        value: 0,
                                        width: 1,
                                        color: '#808080'
                                    }
                                ]
                            },
                            tooltip: {
                                crosshairs: true,
                                shared: true
                            },
                            legend: {
                                layout: 'horizontal',
                                align: 'center',
                                verticalAlign: 'bottom',
                                borderWidth: 0,
                                itemDistance: 30,
                                itemStyle: {
                                    color: 'black'
                                }
                            },
                            exporting: {
                                enabled: false
                            },
                            series: dataSeries,
                            plotOptions: {
                                spline: {
                                    colors: defaultColors,
                                    dataLabels: {
                                        enabled: true,
                                        color: 'darkblack',
                                        formatter: function () {
                                            if (this.point.x === this.series.data[this.series.data.length - 1].x) {
                                                return this.y;
                                            } else {
                                                return null;
                                            }
                                        }
                                    }
                                },
                                series: {
                                    turboThreshold: config.limit
                                }
                            }
                        });

                        //set max number of points displayed in chart
                        config.limit = (lineOpts && lineOpts.length > 0 && lineOpts[0].records) ?
                            lineOpts[0].records.length: null;
                    });
                });
            }

            //draw widget
            drawWidget($scope.widget.config);

            //request table data
            var tableDataPromise = requestData($scope.widget.config, {
                sort: true,
                exportation: 'table',
                invalid_value: '--'
            });

            tableDataPromise.then(function (content){
                content = content || [];

                content = content.map(function (item) {
                    return Object.keys(item).reduce(function (memo, curr) {
                        memo[parseInt(curr, 10)] = item[curr];
                        return memo;
                    }, []);
                });

                $scope.tableContent = content;
                $scope.isDataReady = true;
            });
        });

        //init file download button
        var downloadBtn = $('a.download-file-btn');
        var params = 'period=' + $routeParams.period + '&sort=' + true + '&exportation=' + 'csv' + '&invalid_value=' + '--';
        downloadBtn.attr('href',
            '/api/multiple_data_sources/' + encodeURIComponent(JSON.stringify($scope.dataInfos)) + '/records' + '?' + params
        );
    }
]);

statApp.controller('folderMenuNodeCtrl', ['$scope', 'SubFolder', 'DataSource',
    function ($scope, SubFolder, DataSource) {
        $scope.treeWrapper = {
            folders: [],
            dataSources: []
        };

        $scope.treeWrapper.folders = $scope.folder.id > 0 ? SubFolder.query({
            parent_id: $scope.folder.id,
            project_id: $scope.projectId
        }) : [];

        $scope.treeWrapper.dataSources = $scope.folder.id > 0 ? DataSource.query({
            folder_id: $scope.folder.id,
            project_id: $scope.projectId
        }) : [];
    }
]);
