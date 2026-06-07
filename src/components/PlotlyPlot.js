import { memo } from 'react';
import createPlotlyComponent from 'react-plotly.js/factory';
import Plotly from 'plotly.js/lib/core';
import scatter from 'plotly.js/lib/scatter';

Plotly.register([scatter]);

const PlotComponent = createPlotlyComponent(Plotly);
const Plot = memo(function PlotlyPlot(props) {
  return <PlotComponent {...props} />;
});

export default Plot;
