function drawC() {
	Highcharts.getJSON('https://t2xtoken.io/tokenprice', function (data) {

		// Create the chart
		var chart = Highcharts.stockChart('container-chart', {

			chart: {
				height: 460,
				backgroundColor: '#2e2e49',
				style: {
					fontFamily: '\'Unica One\', sans-serif'
				},
				plotBorderColor: '#606063'
			},

			// title: {
			// 	text: 'T2X price overtime (in TRX)',
			// 	style: {
			// 		color: '#a6947a',
			// 		textTransform: 'uppercase',
			// 		fontSize: '20px'
			// 	}
			// },

			xAxis: {
				gridLineColor: '#858eab7d',
				labels: {
					style: {
						color: '#E0E0E3'
					}
				},
				lineColor: '#858eab7d',
				minorGridLineColor: '#505053',
				tickColor: '#707073',
				title: {
					style: {
						color: '#A0A0A3'

					}
				},

			},
			yAxis: {
				gridLineColor: '#858eab7d',
				labels: {
					style: {
						color: '#E0E0E3'
					}
				},
				lineColor: '#858eab7d',
				minorGridLineColor: '#505053',
				tickColor: '#707073',
				tickWidth: 1,
				title: {
					style: {
						color: '#A0A0A3'
					}
				},

			},

			// tooltip: {
			// 	backgroundColor: 'rgba(0, 0, 0, 0.85)',
			// 	style: {
			// 		color: '#F0F0F0'
			// 	},

			// },
			tooltip: {
				pointFormatter: function () {
					return '<span style="color:{point.color}">\u25CF</span> ' + this.series.name + ': <b>' + this.y.toFixed(5) + '</b><br/>'
				}
			},

			plotOptions: {
				series: {
					dataLabels: {
						color: '#B0B0B3'
					},
					marker: {
						lineColor: '#333'
					}
				},
				boxplot: {
					fillColor: '#505053'
				},
				candlestick: {
					lineColor: 'white'
				},
				errorbar: {
					color: 'white'
				}
			},
			legend: {
				itemStyle: {
					color: '#E0E0E3'
				},
				itemHoverStyle: {
					color: '#FFF'
				},
				itemHiddenStyle: {
					color: '#606063'
				}
			},
			credits: {
				style: {
					color: '#2e2e49'
				}
			},

			rangeSelector: {
				selected: 1
			},

			labels: {
				style: {
					color: '#707073'
				}
			},

			drilldown: {
				activeAxisLabelStyle: {
					color: '#F0F0F3'
				},
				activeDataLabelStyle: {
					color: '#F0F0F3'
				}
			},

			// scroll charts
			rangeSelector: {
				buttonTheme: {
					fill: '#505053',
					stroke: '#000000',
					style: {
						color: '#CCC'
					},
					states: {
						hover: {
							fill: '#707073',
							stroke: '#000000',
							style: {
								color: 'white'
							}
						},
						select: {
							fill: '#000003',
							stroke: '#000000',
							style: {
								color: 'white'
							}
						}
					}
				},
				inputBoxBorderColor: '#505053',
				inputStyle: {
					backgroundColor: '#333',
					color: 'silver'
				},
				labelStyle: {
					color: 'silver'
				},
				buttons: [{
					type: 'day',
					count: 1,
					text: '1d'
				}, {
					type: 'day',
					count: 3,
					text: '3d'
				}, {
					type: 'week',
					count: 1,
					text: '1w'
				}, {
					type: 'week',
					count: 3,
					text: '3w'
				}, {
					type: 'month',
					count: 1,
					text: '1m'
				}, {
					type: 'month',
					count: 3,
					text: '3m'
				}, {
					type: 'all',
					text: 'All'
				}],
				selected: 2

			},

			navigator: {
				handles: {
					backgroundColor: '#666',
					borderColor: '#AAA'
				},
				outlineColor: '#CCC',
				maskFill: 'rgba(255,255,255,0.2)',
				series: {
					color: '#7798BF',
					lineColor: '#f65971'
				},
				xAxis: {
					gridLineColor: '#505053'
				}
			},




















			series: [{
				name: 'T2X TRX Value',
				data: data,
				color: {
					linearGradient: {
						x1: 0,
						x2: 0,
						y1: 0,
						y2: 1
					},
					stops: [
						[0, '#f95f3c'],
						[1, '#f559723d']
					]
				},
				lineColor: '#f77938',
				type: 'area',
				threshold: null,
				tooltip: {
					valueDecimals: 2
				}
			}],

			responsive: {
				rules: [{
					condition: {
						maxWidth: 500
					},
					chartOptions: {
						chart: {
							height: 300
						},
						subtitle: {
							text: null
						},
						navigator: {
							enabled: false
						}
					}
				}]
			}
		});

		chart.setSize(null);
	});

	setTimeout(() => {
		drawC()
	}, 5 * 60 * 1000)
}

drawC()