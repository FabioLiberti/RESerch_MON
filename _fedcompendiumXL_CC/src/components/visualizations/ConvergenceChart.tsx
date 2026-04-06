import React from 'react';
import {
  Box,
  Text,
  useColorModeValue,
  Flex,
  Heading,
} from '@chakra-ui/react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface ConvergenceDataPoint {
  round: number;
  fedavg?: number;
  fedprox?: number;
  scaffold?: number;
  [key: string]: number | undefined;
}

interface ConvergenceChartProps {
  data: ConvergenceDataPoint[];
  height?: number | string;
  title?: string;
  showLegend?: boolean;
  aggregator?: 'fedavg' | 'fedprox' | 'scaffold' | 'all';
}

export const ConvergenceChart: React.FC<ConvergenceChartProps> = ({
  data,
  height = 250,
  title = 'Model Convergence',
  showLegend = true,
  aggregator = 'all',
}) => {
  const textColor = useColorModeValue('gray.800', 'white');
  const gridColor = useColorModeValue('gray.200', 'gray.700');
  
  // Define colors for different aggregators
  const colors = {
    fedavg: '#8884d8',
    fedprox: '#82ca9d',
    scaffold: '#ff7300',
  };
  
  // Determine which lines to show based on aggregator prop
  const showFedAvg = aggregator === 'all' || aggregator === 'fedavg';
  const showFedProx = aggregator === 'all' || aggregator === 'fedprox';
  const showScaffold = aggregator === 'all' || aggregator === 'scaffold';
  
  return (
    <Box>
      {title && (
        <Heading size="sm" mb={4} color={textColor}>
          {title}
        </Heading>
      )}
      
      <Box h={height}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} opacity={0.3} />
            <XAxis
              dataKey="round"
              label={{ value: 'Round', position: 'insideBottom', offset: -5 }}
            />
            <YAxis
              label={{ value: 'Accuracy', angle: -90, position: 'insideLeft' }}
              domain={[0, 1]}
              tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
            />
            <Tooltip
              formatter={(value) => [`${(Number(value) * 100).toFixed(1)}%`, 'Accuracy']}
              labelFormatter={(label) => `Round ${label}`}
            />
            {showLegend && <Legend />}
            
            {showFedAvg && (
              <Line
                type="monotone"
                dataKey="fedavg"
                name="FedAvg"
                stroke={colors.fedavg}
                activeDot={{ r: 8 }}
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            )}
            
            {showFedProx && (
              <Line
                type="monotone"
                dataKey="fedprox"
                name="FedProx"
                stroke={colors.fedprox}
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            )}
            
            {showScaffold && (
              <Line
                type="monotone"
                dataKey="scaffold"
                name="SCAFFOLD"
                stroke={colors.scaffold}
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </Box>
    </Box>
  );
};

export default ConvergenceChart;